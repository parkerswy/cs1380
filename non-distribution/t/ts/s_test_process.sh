#!/bin/bash
# This is a student test

T_FOLDER="t/ts"
R_FOLDER=${R_FOLDER:-}

cd "$(dirname "$0")/../..$R_FOLDER" || exit 1

DIFF=${DIFF:-diff}

if $DIFF <(cat "$T_FOLDER"/process_input.txt | c/process.sh | sort) <(sort "$T_FOLDER"/process_output.txt) >&2;
then
    echo "$0 success: texts are identical"
    exit 0
else
    echo "$0 failure: texts are NOT identical"
    exit 1
fi
