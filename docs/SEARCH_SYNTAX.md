# Search Syntax Reference

## Examples

```text
woman -nsfw
(cat OR dog) creator:john
mime_type:video/mp4 duration:<90s order:date_asc
notes:"sunset scene" has:creator
```

## Tag Tokens

- Any token that is not an operator is treated as a tag.
- Space-separated tags are implicitly `AND`.
- Prefix `-` negates a tag.
- Parentheses allow grouping.
- `AND` and `OR` are supported logical operators (uppercase keywords).

## Operator Tokens

### `limit:<number>`

- Sets result limit.
- Valid range is `1..500`.
- Invalid values fall back to default `100`.

### `order:<mode>`

Supported modes:

- `date`, `date_asc`
- `duration`, `duration_asc`
- `file_size`, `file_size_asc`
- `pixelcount`, `pixelcount_asc`
- `image_ratio`, `image_ratio_asc`
- `tag_count`, `tag_count_asc`

Default is `date` (newest first).

### `mime_type:<value>`

Filters by exact lowercased MIME type.

Example:

- `mime_type:video/mp4`

### `file_size:[op]<number>[unit]`

- Operators: `<=`, `>=`, `<`, `>`, `=`
- Units: `b`, `kb`, `mb`, `gb`
- Default unit: `b`

Examples:

- `file_size:>10mb`
- `file_size:<=512kb`

### `age:[op]<number>[unit]`

Compares age relative to now.

- Units: `s`, `m`, `h`, `d`, `w`, `y`
- Default unit: `d`

Examples:

- `age:<7d`
- `age:>=12h`

### `mpixels:[op]<number>`

Compares `width * height` against megapixel count.
Input value is interpreted in megapixels.

Examples:

- `mpixels:>=2`
- `mpixels:<0.8`

### `duration:[op]<number>[unit]`

- Units: `ms`, `s`, `m`, `h`
- Default unit: `ms`

Examples:

- `duration:<90s`
- `duration:>=2m`

### `image_ratio:[op]<value>`

`value` can be decimal or fraction (`a/b`).

Examples:

- `image_ratio:16/9`
- `image_ratio:>=1.5`

### `notes:<term>`

Matches `media.notes_md` using Typesense full-text search.
Multiple `notes:` terms are combined into one full-text query.
Use quotes for strings with spaces.

Examples:

- `notes:fox`
- `notes:"quick brown"`

### `has:<value>` and `-has:<value>`

- `has:notes` -> notes field is non-empty
- `-has:notes` -> notes field is empty
- Other values are matched against tag `type` (case-insensitive)

Examples:

- `has:character`
- `-has:creator`

## Default Blacklisted Tags

Listing uses user settings (`listing.blacklisted_tags`) as default exclusions.
Each default blacklisted tag is appended as a negated tag filter unless it was explicitly added to the query.

Example:

- Blacklist contains `nsfw`
- Query `cat` behaves like `cat -nsfw`
- Query `nsfw` disables that default exclusion for `nsfw`


