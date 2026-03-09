#!/usr/bin/env bash
# collect-sources.sh — Gathers repository content for LLM.txt generation
# Outputs structured text to stdout
set -euo pipefail

MAX_FILE_SIZE=50000  # Max chars per file
MAX_TOTAL_SIZE=400000  # ~100K tokens budget

total_chars=0

emit_section() {
  local title="$1"
  local content="$2"
  local len=${#content}

  if (( total_chars + len > MAX_TOTAL_SIZE )); then
    local remaining=$(( MAX_TOTAL_SIZE - total_chars ))
    if (( remaining > 100 )); then
      content="${content:0:$remaining}\n... [truncated]"
    else
      return
    fi
  fi

  echo "════════════════════════════════════════════════════════════"
  echo "SECTION: $title"
  echo "════════════════════════════════════════════════════════════"
  echo "$content"
  echo ""

  total_chars=$(( total_chars + ${#content} ))
}

# ── 1. Repository metadata ──────────────────────────────────────────
repo_name="${GITHUB_REPOSITORY:-$(basename "$(pwd)")}"
emit_section "REPOSITORY METADATA" "Repository: $repo_name
Working directory: $(pwd)
Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── 2. README files ─────────────────────────────────────────────────
for readme in README.md readme.md README.rst README.txt; do
  if [[ -f "$readme" ]]; then
    content=$(head -c "$MAX_FILE_SIZE" "$readme")
    emit_section "ROOT README ($readme)" "$content"
    break
  fi
done

# Module-level READMEs (up to 10)
find . -maxdepth 3 -name "README.md" -not -path "./README.md" -not -path "*/node_modules/*" -not -path "*/target/*" -not -path "*/.git/*" 2>/dev/null | head -10 | while read -r file; do
  content=$(head -c "$MAX_FILE_SIZE" "$file")
  emit_section "MODULE README ($file)" "$content"
done

# ── 3. Copilot instructions ─────────────────────────────────────────
if [[ -f ".github/copilot-instructions.md" ]]; then
  content=$(head -c "$MAX_FILE_SIZE" ".github/copilot-instructions.md")
  emit_section "COPILOT INSTRUCTIONS" "$content"
fi

# ── 4. Architecture documentation ───────────────────────────────────
for doc in ARCHITECTURE.md docs/architecture.md docs/ARCHITECTURE.md; do
  if [[ -f "$doc" ]]; then
    content=$(head -c "$MAX_FILE_SIZE" "$doc")
    emit_section "ARCHITECTURE ($doc)" "$content"
  fi
done

# Other markdown docs in docs/ (up to 5)
if [[ -d "docs" ]]; then
  find docs/ -maxdepth 2 -name "*.md" -not -name "llm.txt" 2>/dev/null | head -5 | while read -r file; do
    content=$(head -c 20000 "$file")
    emit_section "DOCUMENTATION ($file)" "$content"
  done
fi

# ── 5. Build files (project structure) ──────────────────────────────
if [[ -f "pom.xml" ]]; then
  content=$(head -c "$MAX_FILE_SIZE" "pom.xml")
  emit_section "ROOT POM.XML" "$content"

  # Module pom.xml files (first 100 lines each, up to 10 modules)
  find . -maxdepth 3 -name "pom.xml" -not -path "./pom.xml" -not -path "*/target/*" -not -path "*/.git/*" 2>/dev/null | head -10 | while read -r file; do
    content=$(head -100 "$file")
    emit_section "MODULE POM ($file)" "$content"
  done
fi

if [[ -f "package.json" ]]; then
  content=$(cat "package.json")
  emit_section "ROOT PACKAGE.JSON" "$content"
fi

# ── 6. Source tree structure ─────────────────────────────────────────
tree_output=""
if command -v tree &>/dev/null; then
  tree_output=$(tree -I 'node_modules|target|dist|.git|.idea|__pycache__' --dirsfirst -L 4 2>/dev/null || true)
else
  tree_output=$(find . \
    -not -path '*/node_modules/*' \
    -not -path '*/target/*' \
    -not -path '*/dist/*' \
    -not -path '*/.git/*' \
    -not -path '*/.idea/*' \
    -type f \
    2>/dev/null | head -500 | sort)
fi
if [[ -n "$tree_output" ]]; then
  emit_section "SOURCE TREE" "$tree_output"
fi

# ── 7. Key interface/boundary files ─────────────────────────────────
key_files=$(find . \
  -not -path '*/node_modules/*' \
  -not -path '*/target/*' \
  -not -path '*/dist/*' \
  -not -path '*/.git/*' \
  -not -path '*/test/*' \
  -not -path '*/tests/*' \
  \( -name "*.java" -o -name "*.ts" -o -name "*.kt" \) \
  2>/dev/null | grep -iE '(boundary|api|spi|controller|resource|endpoint|gateway|facade|service)' | head -20 || true)

if [[ -n "$key_files" ]]; then
  while IFS= read -r file; do
    content=$(head -c "$MAX_FILE_SIZE" "$file")
    emit_section "KEY SOURCE FILE ($file)" "$content"
  done <<< "$key_files"
fi

# ── 8. OpenAPI specifications ────────────────────────────────────────
for spec in $(find . -maxdepth 4 \( -name "openapi.yaml" -o -name "openapi.yml" -o -name "openapi.json" -o -name "swagger.yaml" -o -name "swagger.json" \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -3); do
  content=$(head -c "$MAX_FILE_SIZE" "$spec")
  emit_section "OPENAPI SPEC ($spec)" "$content"
done

# ── 9. Configuration files ──────────────────────────────────────────
for cfg in application.yml application.yaml application.properties src/main/resources/application.yml src/main/resources/application.yaml; do
  if [[ -f "$cfg" ]]; then
    content=$(head -c 20000 "$cfg")
    emit_section "CONFIG ($cfg)" "$content"
  fi
done

# ── 10. Extra context paths (if provided) ───────────────────────────
if [[ -n "${EXTRA_CONTEXT_PATHS:-}" ]]; then
  IFS=',' read -ra patterns <<< "$EXTRA_CONTEXT_PATHS"
  for pattern in "${patterns[@]}"; do
    pattern=$(echo "$pattern" | xargs)  # trim whitespace
    for file in $pattern; do
      if [[ -f "$file" ]]; then
        content=$(head -c "$MAX_FILE_SIZE" "$file")
        emit_section "EXTRA CONTEXT ($file)" "$content"
      fi
    done
  done
fi

echo "════════════════════════════════════════════════════════════"
echo "END OF COLLECTED SOURCES (total chars: ~$total_chars)"
echo "════════════════════════════════════════════════════════════"
