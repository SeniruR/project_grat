# Documents

LaTeX sources for project documentation.

## System requirements

File: `system-requirements.tex`

Build a PDF (run twice so the table of contents is complete):

```bash
cd documents
pdflatex system-requirements.tex
pdflatex system-requirements.tex
```

Requires a TeX distribution with `pdflatex` (TeX Live or MiKTeX).
