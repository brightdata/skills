#!/usr/bin/env bash
# Every SKILL.md must have YAML frontmatter with non-empty name and description.
set -u
fail=0
while IFS= read -r f; do
    err=$(awk '
        NR == 1 { if ($0 != "---") { print "missing opening ---"; exit } next }
        $0 == "---" { closed = 1; exit }
        pending { if ($0 ~ /^[ \t]+[^ \t]/) ok[pending] = 1; pending = "" }
        /^(name|description):/ {
            key = $0; sub(/:.*/, "", key)
            val = $0; sub(/^[a-z]+:[ \t]*/, "", val)
            if (val ~ /^[|>][-+]?[ \t]*$/) pending = key
            else if (val != "" && val != "\"\"" && val != "'"''"'") ok[key] = 1
        }
        END {
            if (NR == 0) print "empty file"
            else if (!closed && NR > 1) print "missing closing ---"
            else if (closed) {
                if (!ok["name"]) print "missing or empty name"
                if (!ok["description"]) print "missing or empty description"
            }
        }' "$f")
    if [ -n "$err" ]; then
        while IFS= read -r line; do echo "::error file=$f::$line"; done <<< "$err"
        fail=1
    fi
done < <(find . -name SKILL.md -not -path './.git/*' | sort)
[ "$fail" -eq 0 ] && echo "All SKILL.md frontmatter OK"
exit "$fail"
