"""Compare archived private project photos with a captured app database.

Only aggregate counts leave this process. Archive objects without a unique
owning project remain sealed; this does not authorize serving any file.
"""
import argparse
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

from storage_copy import ORIGIN, objects

BUCKET = 'project-photos-private'
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
PHOTO_PATH = re.compile(rf'({UUID})/{UUID}\.jpg', re.I)
PREFIX = ORIGIN + '/storage/v1/object/authenticated/' + BUCKET + '/'
SIGNED_PREFIX = ORIGIN + '/storage/v1/object/sign/' + BUCKET + '/'


def compare(manifest, projects):
    archive = {x['source']['name']: x['size'] for x in objects(manifest)
               if x['source']['bucket_id'] == BUCKET and not x['public']}
    if any(x['id'] == BUCKET and x['public'] for x in manifest['buckets']):
        raise ValueError('Expected a private project-photo archive')
    refs = defaultdict(set)
    report = dict(archivedFiles=len(archive), archivedBytes=sum(archive.values()),
                  projects=0, malformedReferenceCount=0, crossOrganizationReferenceCount=0)
    for project_id, org_id, photos_json, hero in projects:
        report['projects'] += 1
        try:
            photos = json.loads(photos_json) if photos_json is not None else []
        except (TypeError, ValueError):
            raise ValueError('Invalid captured project photo array') from None
        if not isinstance(photos, list):
            raise ValueError('Invalid captured project photo array')
        urls = {p['url'] for p in photos if isinstance(p, dict) and isinstance(p.get('url'), str)}
        if isinstance(hero, str):
            urls.add(hero)
        for url in urls:
            if url.startswith(PREFIX):
                path = url[len(PREFIX):]
            elif url.startswith(SIGNED_PREFIX):
                path, sep, token = url[len(SIGNED_PREFIX):].partition('?token=')
                if not sep or not token:
                    path = ''
            elif '/' + BUCKET + '/' in url:
                path = ''
            else:
                continue
            match = PHOTO_PATH.fullmatch(path)
            if not match:
                report['malformedReferenceCount'] += 1
            elif not isinstance(org_id, str) or match[1].lower() != org_id.lower():
                report['crossOrganizationReferenceCount'] += 1
            else:
                refs[path].add(project_id)
    shared = {path for path, projects in refs.items() if len(projects) != 1}
    report.update(
        uniquelyReferencedArchivedFiles=len((archive.keys() & refs.keys()) - shared),
        unreferencedArchivedFiles=len(archive.keys() - refs.keys()),
        multiplyReferencedPaths=len(shared),
        referencedPathsMissingFromArchive=len(refs.keys() - archive.keys()),
        sourceWrites=0,
        privateObjectsServed=0,
    )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('source_snapshot', type=Path)
    args = parser.parse_args()
    with args.inventory.open() as manifest, sqlite3.connect(
        args.source_snapshot.resolve().as_uri() + '?mode=ro', uri=True
    ) as db:
        rows = db.execute('SELECT id, organization_id, photos, hero_url FROM case_studies')
        print(json.dumps(compare(json.load(manifest), rows), indent=2))


if __name__ == '__main__':
    main()
