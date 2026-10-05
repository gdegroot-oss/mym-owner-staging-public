SYNTHETIC OWNER REVIEW — NO PRODUCTION DATA

MYM OWNER STAGING · SYNTHETIC
Source PR #63/head 4b1431ad2931c7e03c968f7bf053247e09d120d8
Requirements: Node.js 22+ only. No install/build/GitHub access needed.
Unzip into a dedicated directory. Start command (working directory = extracted directory):
node start.mjs
Required host environment:
OWNER_STAGING_MODE=synthetic-v1
OWNER_STAGING_ORIGIN=https://YOUR-SEPARATE-STAGING-SERVICE.onrender.com
PORT=host-assigned port (default 8080, 1024..65535)
Render: separate Node web service/container; no repository clone required. Use a host that accepts uploaded artifacts/images. Do not attach production env groups, credentials or databases.
Healthcheck: /health. Only Render *.onrender.com or Railway *.up.railway.app origins accepted; no custom domains. Host/Origin must match exactly. Missing/invalid configuration fails closed.
Open HTTPS root. Nine real app routes; synthetic catalog/profile only. Premium playback/auth/signup/deletion denied. POST/PUT/DELETE denied. Generated in-memory silence only. No A1/PRO audio. Play A1 separately in Windows Media Player.
Use only synthetic form text. Community drafts/resume may persist in this browser on this isolated origin; no server persistence. Hosting edge logs are host-managed; not private-audio handling.
MANIFEST.json lists SHA-256 of every other file and original source hashes. Start checks complete file inventory and hashes. Manifest itself is covered by the outer ZIP SHA-256; verify ZIP hash before extraction. Checksums are integrity evidence, not a digital signature.
Artifact-only changes: server origin allowlist additionally accepts *.onrender.com; start.mjs adds inventory/hash/revision checks. All shipped public UI + synthetic adapter/init are byte-identical to source head. No deploy/merge performed.
