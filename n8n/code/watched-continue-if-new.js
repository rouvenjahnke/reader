// n8n Code node: restore each candidate after the parameterized dedup query.
return $input.all().flatMap((row, index) => {
  if (Boolean(row.json.is_duplicate)) return [];
  return [{
    json: $('Parse + flatten').itemMatching(index).json,
    pairedItem: { item: index },
  }];
});
