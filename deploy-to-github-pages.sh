#!/usr/bin/env bash

# Exit immediately if any command exits with a non-zero status
set -e

# Get the remote URL of the current repository
REMOTE_URL=$(git config --get remote.origin.url)

# Navigate into the distribution directory
cd dist

# Initialize a temporary, isolated git repository inside dist/
git init
git add .
git commit -m "Deploy to GitHub Pages"

# Force push the local main of the dist folder to the remote gh-pages branch
# This overwrites the history of gh-pages with exactly what is in dist/
git push --force "$REMOTE_URL" main:gh-pages

# Clean up the temporary git repository inside dist/
rm -rf .git

# Navigate back to the repository root
cd ..
