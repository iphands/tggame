#!/usr/bin/env bash
# primes.sh — calculate all primes up to a limit (default 10,000,000).
#
# Uses the sieve of Eratosthenes. The heavy sieve runs in awk (gawk):
# tracking 10M flags in pure bash arrays would need ~1 GB and crawl,
# so bash handles argument parsing, timing and reporting around the sieve.
#
# Usage:
#   primes.sh [options]
#
# Options:
#   -l, --limit N     upper bound, inclusive (default: 10000000)
#   -o, --output FILE write the prime list to FILE (default: stdout)
#   -q, --quiet       do not print the prime list; only print a summary
#   -h, --help        show this help and exit
#
# Examples:
#   primes.sh                   # primes up to 10,000,000 on stdout
#   primes.sh -l 100000 -q      # just the count, up to 100k
#   primes.sh -o primes.txt     # save the list to primes.txt

set -euo pipefail

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}"
}

limit=10000000
outfile="-"
quiet=0

usage_flag=0
while (($#)); do
  case $1 in
    -l|--limit)
      [[ $# -ge 2 ]] || { echo "error: --limit needs a value" >&2; exit 2; }
      limit=$2; shift 2 ;;
    -o|--output)
      [[ $# -ge 2 ]] || { echo "error: --output needs a value" >&2; exit 2; }
      outfile=$2; shift 2 ;;
    -q|--quiet)
      quiet=1; shift ;;
    -h|--help)
      usage_flag=1; shift ;;
    --)
      shift; break ;;
    -*)
      echo "error: unknown option '$1'" >&2
      exit 2 ;;
    *)
      # convenience: a bare number is treated as the limit
      if [[ $limit == 10000000 && $1 =~ ^[0-9]+$ ]]; then
        limit=$1; shift
      else
        echo "error: unexpected argument '$1'" >&2
        exit 2
      fi ;;
  esac
done

if ((usage_flag)); then
  usage
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  echo "error: unexpected argument '$1'" >&2
  exit 2
fi

if [[ ! $limit =~ ^[1-9][0-9]*$ ]]; then
  echo "error: limit must be a positive integer (got '$limit')" >&2
  echo "Try 'primes.sh --help'." >&2
  exit 2
fi

if command -v gawk >/dev/null 2>&1; then
  AWK=gawk
elif command -v awk >/dev/null 2>&1; then
  AWK=awk
else
  echo "error: awk is required (gawk recommended) but not found" >&2
  exit 1
fi

start_ns=$(date +%s%N)

# The prime list goes to stdout (or the output file); the summary goes to
# stderr so the prime data on stdout stays clean and pipe-friendly.
# quiet=1 suppresses the per-prime output entirely.
SIEVE='
BEGIN {
  if (lim < 2) {
    print "primes.sh: limit must be at least 2 (got " lim ")" > "/dev/stderr"
    exit 3
  }
  for (i = 2; i <= lim; i++) is_prime[i] = 1
  for (i = 2; i * i <= lim; i++) {
    if (is_prime[i]) {
      for (j = i * i; j <= lim; j += i) is_prime[j] = 0
    }
  }
  cnt = 0
  maxp = 0
  for (i = 2; i <= lim; i++) {
    if (is_prime[i]) {
      cnt++
      maxp = i
      if (quiet == 0) print i
    }
  }
  printf "primes: %d (largest: %d)\n", cnt, maxp > "/dev/stderr"
}'

if [[ $outfile == "-" ]]; then
  $AWK -v lim="$limit" -v quiet="$quiet" "$SIEVE"
else
  $AWK -v lim="$limit" -v quiet="$quiet" "$SIEVE" > "$outfile"
fi

end_ns=$(date +%s%N)
elapsed=$(awk -v s="$start_ns" -v e="$end_ns" 'BEGIN { printf "%.2f s", (e - s) / 1000000000 }')

{
  echo "limit:   $limit"
  echo "elapsed: $elapsed"
} >&2
