# Documents

Server / infrastructure handover PDFs live here.

## Policy

- **Commit:** `*.pdf` only (e.g. `system-requirements.pdf`)
- **Do not commit:** `*.tex` and LaTeX build artefacts (ignored by `.gitignore`)

Edit the local `.tex` source, rebuild the PDF, then commit the PDF.

## System requirements (simple server handover)

Local source (ignored by Git): `system-requirements.tex`  
Committed deliverable: `system-requirements.pdf`

```bash
cd documents
pdflatex system-requirements.tex
```

## Project guidelines (server host procedure)

Local source (ignored by Git): `project-guidelines.tex`  
Committed deliverable: `project-guidelines.pdf`

Linux VM deploy checklist only (install, env, migrate, nginx, smoke checks).

```bash
cd documents
pdflatex project-guidelines.tex
pdflatex project-guidelines.tex
```

Requires a TeX distribution with `pdflatex` (TeX Live or MiKTeX).
