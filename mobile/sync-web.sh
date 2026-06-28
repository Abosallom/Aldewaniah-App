#!/usr/bin/env bash
# Copy the web app (the parent folder) into ./www so Capacitor can bundle it.
# Run from inside the mobile/ folder:  npm run sync-web
set -e
DEST="www"
rm -rf "$DEST"
mkdir -p "$DEST"

# Copy the static web files only (skip git, node, docs, the mobile folder itself).
for item in index.html sw.js manifest.json privacy.html terms.html css js assets; do
  if [ -e "../$item" ]; then
    cp -R "../$item" "$DEST/"
  fi
done

echo "✓ Copied the web app into mobile/$DEST"
