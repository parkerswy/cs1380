#!/bin/bash
# This is a student test

T_FOLDER="t/ts"
R_FOLDER=${R_FOLDER:-}

cd "$(dirname "$0")/../..$R_FOLDER" || exit 1

DIFF=${DIFF:-diff}

url="https://slay.com/index.html"

if ! $DIFF <(cat "$T_FOLDER"/getURLs_input.txt | c/getURLs.js $url | sort) <(sort "$T_FOLDER"/getURLS_output.txt) >&2;
then
    echo "$0 URL sets are NOT identical"
    exit 1
fi

echo "$0 URL sets are identical"
exit 0
