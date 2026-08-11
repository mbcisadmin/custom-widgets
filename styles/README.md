# styles

Standalone CSS files that can be referenced when calling MinistryPlatform widgets.

These are not tied to any single widget project in this repo — they are the CSS
overrides that get loaded alongside a stock MP widget (previously hosted in
`my.mcleanbible.org/CustomFiles/`).

## Usage

Served via GitHub Pages at:

```
https://mclean-bible-church.github.io/custom-widgets/styles/<file>.css
```

Reference it on the page that renders the widget:

```html
<link
  rel="stylesheet"
  href="https://mclean-bible-church.github.io/custom-widgets/styles/CGsearch.css" />
```

## Files

| File           | Used with                                                            |
| -------------- | -------------------------------------------------------------------- |
| `CGsearch.css` | Group search widget — hides unused search/advanced-search fields, forces the advanced search section open, and hides the sign-up tab. |
| `CleanOpp.css` | Opportunity widget — hides the form message, response form title, innerpage back link, map container, and the date/"Ongoing" row on Opportunity Finder cards. (Also carries two commented-out blocks kept from the original file.) |
