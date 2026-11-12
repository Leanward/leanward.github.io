#!/usr/bin/env bash
# Leanward — times Open Food Facts' search services as the app would call them (with the app's
# Origin header) and prints whether they allow a web page to read the answer (CORS). No database.
set -uo pipefail
ORIGIN=https://leanward.github.io
FIELDS='code,product_name,brands,nutriments,serving_size,serving_quantity'
IFS=';' read -ra QS <<< "${SEARCH_QUERIES:-transparent labs;quest overload;fairlife}"
for q in "${QS[@]}"; do
  e=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$q")
  for url in \
    "https://search.openfoodfacts.org/search?q=$e&page_size=24&fields=$FIELDS" \
    "https://us.openfoodfacts.org/cgi/search.pl?search_terms=$e&search_simple=1&action=process&json=1&page_size=24&sort_by=unique_scans_n&fields=$FIELDS" \
    "https://world.openfoodfacts.org/api/v2/search?search_terms=$e&page_size=24&fields=$FIELDS"; do
    echo "=== $q :: ${url%%\?*}"
    curl -s -m 40 -D /tmp/h -o /tmp/b -H "Origin: $ORIGIN" -A 'Leanward/0.8 (search check)' -w 'status %{http_code}, %{time_total}s, %{size_download} bytes\n' "$url" || echo "curl failed or timed out"
    grep -i '^access-control-allow-origin' /tmp/h || echo "(no access-control-allow-origin header)"
    node -e 'try { const j = JSON.parse(require("fs").readFileSync("/tmp/b", "utf8")); const l = j.hits || j.products || []; console.log("results:", l.length, "| first:", l.slice(0, 3).map((p) => (p.product_name || "?") + " / " + (p.brands || "")).join(" ; ")); if (l[0]) console.log("nutriment keys:", Object.keys(l[0].nutriments || {}).filter((k) => /_100g$/.test(k)).slice(0, 8).join(",")); } catch (e) { console.log("not JSON:", require("fs").readFileSync("/tmp/b", "utf8").slice(0, 120)); }'
  done
done
