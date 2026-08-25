# Third-Party Notices

This file records third-party source copied into this repository. Package
dependencies retain the licenses declared by their packages and lockfile
metadata.

## BehaviorLog Bundle reference validator

Cadence includes an adapted snapshot of the BehaviorLog Bundle reference
validator at `tests/fixtures/behaviorlog-reference/validate.mjs`.

- Source: `https://github.com/emixd12/BehaviorLog-Bundle`
- Snapshot commit: `d3b3850ed6cd4fb243b091ae14baeb24fdd653e9`
- Local adaptation: unused Node imports were removed; validation behavior was
  unchanged.
- License at the pinned commit: MIT

The required upstream notice follows.

```text
MIT License

Copyright (c) 2026 BehaviorLog Bundle contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
