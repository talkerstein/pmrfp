import { normalizeVisibility } from "./visibility";

/**
 * Who may see a project's photos (pure, tested). photo-storage.ts asks this
 * before it signs a single private-bucket URL, so a page that loads a
 * project for the wrong person still gets no photos.
 *
 * The caller proves the viewer first and says who they are:
 *   member     signed in, and session.organization is this company
 *   admin      admin / super_admin
 *   share      opened a live (unrevoked) share link for THIS project
 *   reviewer   opened a valid review invite for THIS project
 *   anonymous  anyone else, including PMs following an unlisted link
 */
export type PhotoViewer =
  | { kind: "anonymous" }
  | { kind: "member"; organizationId: string }
  | { kind: "admin" }
  | { kind: "share"; caseStudyId: string }
  | { kind: "reviewer"; caseStudyId: string };

export interface PhotoProject {
  id: string;
  organizationId: string;
  visibility: string | null | undefined;
  status: string;
}

export function canViewProjectPhotos(project: PhotoProject, viewer: PhotoViewer): boolean {
  switch (viewer.kind) {
    case "admin":
      return true;
    case "member":
      return Boolean(viewer.organizationId) && viewer.organizationId === project.organizationId;
    case "share":
      // A share link only resolves while the project is live (share.ts).
      return viewer.caseStudyId === project.id && project.status === "published";
    case "reviewer":
      return viewer.caseStudyId === project.id;
    case "anonymous":
      // Public and unlisted projects open for anyone holding the page link.
      return project.status === "published" && normalizeVisibility(project.visibility) !== "private";
  }
}
