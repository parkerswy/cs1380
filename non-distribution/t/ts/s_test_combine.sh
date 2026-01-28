#!/bin/bash
# This is a student test

T_FOLDER="t/ts"
R_FOLDER=${R_FOLDER:-}

cd "$(dirname "$0")/../..$R_FOLDER" || exit 1

DIFF=${DIFF:-diff}

if $DIFF <(cat "$T_FOLDER"/combine_input.txt | c/combine.sh | sed 's/\t*$//' | sed 's/\s/ /g' | sort | uniq) <(cat "$T_FOLDER"/combine_output.txt | sed 's/\t*$//' | sed 's/\s/ /g' | sort | uniq) >&2;
then
    echo "$0 ngrams are identical"
    exit 0
else
    echo "$0 ngrams are NOT identical"
    exit 1
fi