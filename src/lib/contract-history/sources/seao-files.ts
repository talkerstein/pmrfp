/**
 * SEAO JSON files on Données Québec as listed on the dataset page on
 * 2026-10-16 (file name → resource id). The dataset page now answers
 * scripted clients with a bot challenge (AWS WAF), which the importer never
 * tries to pass. When the live page can't be read, the importer uses this
 * list, so the monthly backfill (2021-03 → 2026-09) keeps working; newer
 * files are picked up whenever the page is readable, or an admin passes
 * ?url= with a /download/ link copied from the dataset page in a browser.
 */
export const SEAO_DATASET_ID = "d23b2e02-085d-43e5-9e6e-e1d558ebfdd5";

export const SEAO_SAVED_FILES: readonly (readonly [name: string, resourceId: string])[] = [
  ["hebdo_20261005_20261011.json", "868890cd-7846-4ee5-a8ed-933294f8d346"],
  ["hebdo_20260928_20261004.json", "048e71e2-e17d-46bc-b5a6-096b00aa9ca0"],
  ["hebdo_20260921_20260927.json", "0c7d1bfd-da84-41fc-b714-56789d1b4d28"],
  ["hebdo_20260914_20260920.json", "b1ad7b19-5c4b-4311-82fd-d11f1b783e9f"],
  ["mensuel_20260901_20260930.json", "b7ac3d06-bdc0-492d-8801-c7f650eba2ce"],
  ["mensuel_20260801_20260831.json", "b11b4088-f193-4ae8-83ec-d5e113bb164c"],
  ["mensuel_20260701_20260731.json", "a336dd6c-cf8a-44f4-b3bb-5425c3274428"],
  ["mensuel_20260601_20260630.json", "eb34be05-2d89-4e75-a321-38642f0f9c53"],
  ["mensuel_20260501_20260531.json", "0f79befd-1968-4122-89ee-952626262419"],
  ["mensuel_20260401_20260430.json", "563e23ce-20fc-470e-a147-0ac351b21db9"],
  ["mensuel_20260301_20260331.json", "e023cdae-6ccf-4c21-b085-78011de234b7"],
  ["mensuel_20260201_20260228.json", "80255833-2e06-486f-b877-c1621f42c444"],
  ["mensuel_20260101_20260131.json", "80f37f9e-d7b2-4fb8-b8aa-c5c31202e7d9"],
  ["mensuel_20251201_20251231.json", "0ca534c1-5f62-43f4-8d9b-c14a32e25a19"],
  ["mensuel_20251101_20251130.json", "f99004d8-d8c7-41c5-ad6b-f91486656675"],
  ["mensuel_20251001_20251031.json", "ad664e0a-d0b9-44e4-8599-44c9fb993190"],
  ["mensuel_20250901_20250930.json", "ec48c72b-f484-41fa-a324-3e0cd17ccc21"],
  ["mensuel_20250801_20250831.json", "81d7ef09-b950-4013-831f-86edaba11807"],
  ["mensuel_20250701_20250731.json", "12a9b716-bb60-4ed4-b398-ce5b56ead2b4"],
  ["mensuel_20250601_20250630.json", "62aaeb66-11ce-44c8-adb4-86a4a90d677e"],
  ["mensuel_20250501_20250531.json", "ba993578-b900-4b29-8818-534406b4d033"],
  ["mensuel_20250401_20250430.json", "16f7ef55-dd9a-4611-a2e3-a1c419577ca4"],
  ["mensuel_20250301_20250331.json", "4ea647f4-91ee-4490-9192-b663a5c4f100"],
  ["mensuel_20250201_20250301.json", "08c3c0f7-6eb7-4245-88bf-93a6f5020491"],
  ["mensuel_20250101_20250131.json", "674daf95-21bb-4526-834e-f2978c365fe2"],
  ["mensuel_20241201_20241231.json", "54ea88df-eace-4594-b48b-37fb38072fc7"],
  ["mensuel_20241101_20241130.json", "e764ec5e-1429-472b-9938-b024910252fa"],
  ["mensuel_20241001_20241031.json", "d1f7b3e5-0073-4eef-9a0a-043fdccfa693"],
  ["mensuel_20240901_20240930.json", "2a10a65b-fd6a-495d-9c4d-a1e6d15ddbac"],
  ["mensuel_20240801_20240831.json", "fc2b3c2e-a04a-49c4-88a0-e1d3d8deb4bf"],
  ["mensuel_20240701_20240731.json", "f48b3aac-382d-4e41-90d7-235946179235"],
  ["mensuel_20240601_20240630.json", "f25e1348-4622-409c-9677-7dc1502e7a47"],
  ["mensuel_20240501_20240531.json", "9ebbb969-c178-4252-ac1e-8794a261ed70"],
  ["mensuel_20240401_20240430.json", "1fecfb32-6f8a-4f8a-bb72-1371176a4721"],
  ["mensuel_20240301_20240331.json", "4fa973fc-1f4d-4eff-a7b8-574aa5b0215a"],
  ["mensuel_20240201_20240229.json", "c0626500-4cb8-478b-9bdc-d9a574dbdaeb"],
  ["mensuel_20240101_20240131.json", "5bbc4b40-1127-4530-bade-02a2fdd3c680"],
  ["mensuel_20231201_20231231.json", "31bf01f0-f347-4b69-a5cd-389eaac145f7"],
  ["mensuel_20231101_20231130.json", "7a197967-226f-4735-bc45-6ddfc1347a11"],
  ["mensuel_20231001_20231031.json", "b5fa5b13-f042-4d2d-96da-baad81cf569e"],
  ["mensuel_20230901_20230930.json", "3781ad39-1757-4b71-bc46-fa3b383954c5"],
  ["mensuel_20230801_20230831.json", "4b46bc6d-4a43-47ce-b0e2-c36a3aa7e92a"],
  ["mensuel_20230701_20230731.json", "b194e792-3ffe-4c38-966d-b8ec4b0b0966"],
  ["mensuel_20230601_20230630.json", "6cde096a-56fc-49b7-bdf6-4602de4d77bc"],
  ["mensuel_20230501_20230531.json", "12e4551d-80bd-4961-88e8-f43cd5394112"],
  ["mensuel_20230401_20230430.json", "f28efa2d-9842-40fc-a166-35b618206d7d"],
  ["mensuel_20230301_20230331.json", "7c00c0af-a876-4d22-a012-02d0e106f955"],
  ["mensuel_20230201_20230228.json", "2a738935-88b7-494f-a89a-319a1d121204"],
  ["mensuel_20230101_20230131.json", "fab8c266-71f6-47ee-a88b-421900d99eda"],
  ["mensuel_20221201_20221231.json", "1af71c82-fd74-45b1-bf55-90599eb1469f"],
  ["mensuel_20221101_20221130.json", "884fdb17-5ec7-4419-bf8b-6f93e84a9ea1"],
  ["mensuel_20221001_20221031.json", "78f8aff0-1282-4bd7-817d-a5eecce526dc"],
  ["mensuel_20220901_20220930.json", "c3d8869a-61f7-4c0d-8bd2-c18f70351a82"],
  ["mensuel_20220801_20220831.json", "2b8ee577-3414-4378-9c32-c940c6f5716c"],
  ["mensuel_20220701_20220731.json", "9c985fbe-4b82-4bf5-91f4-33cd8124b65b"],
  ["mensuel_20220601_20220630.json", "c45f5c22-a9b0-436c-95cd-745f1fc297ab"],
  ["mensuel_20220501_20220531.json", "4e39ae6c-f32e-49d5-9b2b-5574a30e9e2b"],
  ["mensuel_20220401_20220430.json", "5c9a8af2-fe4c-414d-8b57-a3cb0ac79fa4"],
  ["mensuel_20220301_20220331.json", "0b558a7a-a85b-4d36-8ce0-bc1507fd335f"],
  ["mensuel_20220201_20220228.json", "a053dd62-3baa-448e-be19-00b810cb09f2"],
  ["mensuel_20220101_20220131.json", "e068da1e-51be-4db1-981b-ce489cc26af1"],
  ["mensuel_20211201_20211231.json", "29680aa9-96a0-4b6b-b8ca-2b824baf717a"],
  ["mensuel_20211101_20211130.json", "7bce77da-346c-4c0d-973d-2ee30f2b8de7"],
  ["mensuel_20211001_20211031.json", "eafdb003-df33-4b28-89d5-0df7e4f24143"],
  ["mensuel_20210901_20210930.json", "9b67b2dc-4582-4962-8de8-79cae3ea67a3"],
  ["mensuel_20210801_20210831.json", "db2a850d-29f3-406a-a871-da5af924d3bf"],
  ["mensuel_20210701_20210731.json", "ef01e892-da47-4e50-90f9-19cb04113048"],
  ["mensuel_20210601_20210630.json", "48561625-a93c-4029-8e92-25ed9d901f43"],
  ["mensuel_20210501_20210531.json", "7f900036-6579-4765-bc0c-c73b4ff77a9e"],
  ["mensuel_20210401_20210430.json", "e8246369-6b50-4e10-bc7f-8e4e2804c892"],
  ["mensuel_20210301_20210331.json", "291d8cc0-5c6b-4ced-a8d0-d7b880a33809"],
];

export const seaoDownloadUrl = (name: string, resourceId: string) =>
  `https://www.donneesquebec.ca/recherche/dataset/${SEAO_DATASET_ID}/resource/${resourceId}/download/${name}`;

/** The plain dataset page (robots.txt allows it; the CKAN API under /recherche/api/ is disallowed). */
export const SEAO_DATASET_PAGE = "https://www.donneesquebec.ca/recherche/dataset/systeme-electronique-dappel-doffres-seao";

export interface SeaoFile {
  name: string;
  url: string;
  kind: "hebdo" | "mensuel";
  from: string;
}

/** /download/ JSON files listed on the dataset page, newest first. */
export function seaoFilesFromPage(html: string): SeaoFile[] {
  const seen = new Map<string, SeaoFile>();
  for (const m of html.matchAll(/https:\/\/www\.donneesquebec\.ca\/recherche\/dataset\/[0-9a-f-]+\/resource\/[0-9a-f-]+\/download\/((hebdo|mensuel)_(\d{8})_\d{8}\.json)/g)) {
    if (!seen.has(m[1])) seen.set(m[1], { name: m[1], url: m[0], kind: m[2] as "hebdo" | "mensuel", from: m[3] });
  }
  return [...seen.values()].sort((a, b) => b.from.localeCompare(a.from) || a.kind.localeCompare(b.kind));
}

/** The saved list above, newest first. */
export function savedSeaoFiles(): SeaoFile[] {
  return seaoFilesFromPage(SEAO_SAVED_FILES.map(([name, id]) => seaoDownloadUrl(name, id)).join(" "));
}
