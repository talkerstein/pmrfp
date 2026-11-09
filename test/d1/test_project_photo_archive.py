import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/d1'))
from audit_project_photo_archive import BUCKET, PREFIX, compare


class ProjectPhotoArchiveTest(unittest.TestCase):
    def test_matches_only_unique_owned_projects_and_reports_missing_files(self):
        org = '10000000-0000-0000-0000-000000000001'
        wrong_org = '20000000-0000-0000-0000-000000000001'
        paths = [f'{org}/30000000-0000-0000-0000-{i:012}.jpg' for i in range(1, 6)]
        manifest = {
            'buckets': [{'id': BUCKET, 'public': False}],
            'objects': [{'bucket_id': BUCKET, 'name': path,
                         'metadata': {'size': 8, 'mimetype': 'image/jpeg'}}
                        for path in paths[:4]],
        }
        photo = lambda *urls: json.dumps([{'url': url} for url in urls])
        report = compare(manifest, [
            ('p1', org, photo(PREFIX + paths[0], PREFIX + paths[1]), PREFIX + paths[0]),
            ('p2', org, photo(PREFIX + paths[1], PREFIX + paths[4]), None),
            ('p3', wrong_org, photo(PREFIX + paths[2], 'https://invalid.test/' + BUCKET + '/x'), None),
        ])
        self.assertEqual(report['uniquelyReferencedArchivedFiles'], 1)
        self.assertEqual(report['unreferencedArchivedFiles'], 2)
        self.assertEqual(report['multiplyReferencedPaths'], 1)
        self.assertEqual(report['referencedPathsMissingFromArchive'], 1)
        self.assertEqual(report['crossOrganizationReferenceCount'], 1)
        self.assertEqual(report['malformedReferenceCount'], 1)
        self.assertNotIn(org, json.dumps(report))


if __name__ == '__main__':
    unittest.main()
