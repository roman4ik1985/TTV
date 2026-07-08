# PDF Import Edge Cases

## Covered Outcomes

- Clean text PDF: import should return extracted text.
- Image-only or scanned PDF: import should fail as OCR-required, not as corrupted text.
- Corrupted glyph text: import should fail as a damaged text layer.
- Mixed Cyrillic/Latin text: readability heuristic should not classify normal mixed text as corrupted.

## Regression Command

Run:

```powershell
npm run check:pdf-import
```

The command generates temporary PDF fixtures at runtime and removes them automatically.

## OCR Policy

OCR is not implicit in the current import path. Image-only PDFs should produce a clear OCR-required message so the user can choose a text PDF, OCR externally, or use a future optional OCR feature.

## Notes

- The corrupted-glyph branch is tested through `validate_pdf_extracted_text` because reproducing real damaged font maps in generated PDF bytes is fragile.
- Layout-heavy PDFs still depend on `pypdf` extraction behavior; if layout extraction fails, the user-facing message should stay explicit about whether the problem is missing text or a damaged text layer.
