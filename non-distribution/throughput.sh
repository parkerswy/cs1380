#!/bin/bash
set -euo pipefail

ts=(
  "centuri instanc"
  "check stuff"
  "govern agenc research"
  "moscow west"
  "zone"
)

vs=(
  "https://cs.brown.edu/courses/csci1380/sandbox/1/level_1a/index.html"
  "https://cs.brown.edu/courses/csci1380/sandbox/1/level_1a/level_2b/index.html"
  "https://cs.brown.edu/courses/csci1380/sandbox/1/level_1b/fact_3/index.html"
  "https://cs.brown.edu/courses/csci1380/sandbox/1/level_1c/fact_6/index.html"
  "https://cs.brown.edu/courses/csci1380/sandbox/1/level_1b/index.html"
)


now_ns() {
  date +%s%N 2>/dev/null || date +%s000000000
}

ns_to_s() {
  awk -v ns="$1" 'BEGIN { printf "%.6f", ns/1000000000 }'
}

rate() {
  awk -v c="$1" -v s="$2" 'BEGIN { if (s>0) printf "%.3f", c/s; else print "0.000" }'
}

mkdir -p d

# Crawler Throughput
: > d/visited.txt
: > d/urls.txt

crawl_succeeded=0
crawl_start_ns="$(now_ns)"

for url in "${vs[@]}"; do
  : > d/visited.txt
  : > d/urls.txt

  if ./crawl.sh "$url" >/dev/null; then
    crawl_succeeded=$((crawl_succeeded + 1))
  fi
done

crawl_end_ns="$(now_ns)"
crawl_elapsed_s="$(ns_to_s $((crawl_end_ns - crawl_start_ns)))"
crawl_throughput="$(rate "$crawl_succeeded" "$crawl_elapsed_s")"

# Indexer Throughput
: > d/visited.txt
: > d/urls.txt
: > d/global-index.txt

index_succeeded=0
index_total_ns=0

for url in "${vs[@]}"; do
  if ./crawl.sh "$url" > d/content.txt; then
    t0="$(date +%s%N 2>/dev/null || date +%s000000000)"
    if ./index.sh d/content.txt "$url" >/dev/null; then
      index_succeeded=$((index_succeeded + 1))
    fi
    t1="$(date +%s%N 2>/dev/null || date +%s000000000)"
    index_total_ns=$((index_total_ns + (t1 - t0)))
  fi
done

index_elapsed_s="$(awk -v ns="$index_total_ns" 'BEGIN { printf "%.6f", ns/1000000000 }')"
index_throughput="$(rate "$index_succeeded" "$index_elapsed_s")"


# Query Throughput
: > d/visited.txt
: > d/urls.txt
: > d/global-index.txt

query_succeeded=0
query_start_ns="$(now_ns)"

for q in "${ts[@]}"; do
  if ./query.js "$q" >/dev/null; then
    query_succeeded=$((query_succeeded + 1))
  fi
done

query_end_ns="$(now_ns)"
query_elapsed_s="$(ns_to_s $((query_end_ns - query_start_ns)))"
query_throughput="$(rate "$query_succeeded" "$query_elapsed_s")"

# Results
echo "Crawler:  ${crawl_succeeded} pages in ${crawl_elapsed_s}s   => ${crawl_throughput} pages/sec"
echo "Indexer:  ${index_succeeded} pages in ${index_elapsed_s}s   => ${index_throughput} pages/sec"
echo "Query:    ${query_succeeded} queries in ${query_elapsed_s}s => ${query_throughput} queries/sec"