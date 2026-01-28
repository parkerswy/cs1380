#!/bin/bash
# This is a student test

T_FOLDER="t/ts"
R_FOLDER=${R_FOLDER:-}

cd "$(dirname "$0")/../..$R_FOLDER" || exit 1

DIFF=${DIFF:-diff}
DIFF_PERCENT=${DIFF_PERCENT:-0}

cat /dev/null > merge_global.txt

files=(merge_input1.txt merge_input2.txt)

for file in "${files[@]}"
do
    cat "$T_FOLDER/$file" | c/merge.js merge_global.txt > merge_temp_global.txt
    mv merge_temp_global.txt merge_global.txt
done


if DIFF_PERCENT=$DIFF_PERCENT t/gi-diff.js <(sort merge_global.txt) <(sort "$T_FOLDER"/merge_output.txt) >&2;
then
    echo "$0 success: global indexes are identical"
    exit 0
else
    echo "$0 failure: global indexes are NOT identical"
    exit 1
fi
