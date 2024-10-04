# Hare Instagram Thing

- seth article date screws things up
- could revamp detection algo
  - get array of p tags
  - get index of p tag (can only be first index) that can be read as date
  - get index of p tag that has "Article by:"
  - get index of p tag that has "Image Credits:"
  - remove those indices from the content p tag array
  - use those removed tags for metadata (find date tag for date if not p)
- another idea: more room for title by having author and hare logo on same line
