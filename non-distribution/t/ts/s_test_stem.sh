#!/bin/bash
# This is a student test

T_FOLDER="t/ts"
R_FOLDER=${R_FOLDER:-}

cd "$(dirname "$0")/../..$R_FOLDER" || exit 1

DIFF=${DIFF:-diff}

if $DIFF <(cat "$T_FOLDER"/stem_input.txt | c/stem.js | sort) <(sort "$T_FOLDER"/stem_output.txt) >&2;
then
    echo "$0 stemmed words are identical"
    exit 0
else
    echo "$0 stemmed words are NOT identical"
    exit 1
fi
