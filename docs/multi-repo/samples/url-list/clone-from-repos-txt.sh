#!/usr/bin/env bash
# Clone every https/git URL from repos.txt into sibling folders.
# Run from the workspace root that contains .oimo/repos.txt:
#   bash path/to/clone-from-repos-txt.sh
set -euo pipefail

if [ -f .oimo/repos.txt ]; then
  LIST=".oimo/repos.txt"
  BASE="$PWD"
elif [ -f repos.txt ]; then
  LIST="repos.txt"
  BASE="$PWD"
else
  echo "Place .oimo/repos.txt (or repos.txt) in the current directory." >&2
  exit 1
fi

while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"
  # trim
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [ -z "$line" ] && continue
  case "$line" in
    [Nn]ame:*|[Pp]rimary:*) continue ;;
  esac

  url=""
  id=""
  for part in $line; do
    case "$part" in
      http://*|https://*|git@*) url="$part" ;;
      id=*) id="${part#id=}" ;;
    esac
  done
  [ -z "$url" ] && continue
  url="${url%.git}"
  if [ -z "$id" ]; then
    id="$(basename "$url")"
  fi
  dest="$BASE/$id"
  if [ -d "$dest/.git" ]; then
    echo "skip (exists): $dest"
    continue
  fi
  echo "git clone ${url}.git $dest"
  git clone "${url}.git" "$dest"
done < "$LIST"
