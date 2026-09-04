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

MP widgets render into a **shadow root**, so a page-level `<link>` cannot reach
their internals. Attach the stylesheet with the widget's `customcss` attribute
instead:

```html
<mpp-opportunity-details
  customcss="https://mclean-bible-church.github.io/custom-widgets/styles/CleanOpp.css"
  returnurl="/opportunity-finder">
</mpp-opportunity-details>
```

GitHub Pages serves these with `cache-control: max-age=600`, so after editing a
file either wait ~10 minutes or bump a version on the attribute
(`...CleanOpp.css?v=2`) to force browsers to pick up the change.

## Finder cards vs. detail view

The same visual element has different classes depending on the widget, so
selectors are not interchangeable:

| Element              | Finder cards (`*Finder.js`)                | Detail view (`*Details.js`)      |
| -------------------- | ------------------------------------------ | -------------------------------- |
| Opportunity date row | `.mpp-card--subtitle.opportunity-start-date` (`h4`) | `.mpp-innerpage--datetime` (`div` > `h2`) |
| Event date row       | `.mpp-card--subtitle.event-date-range` (`h4`)        | `.mpp-innerpage--datetime`       |
| Group date row       | `.mpp-card--subtitle.group-start-date` (`h4`)        | `.mpp-innerpage--datetime`       |

Note that on the **event**, **group**, and **mission trip** detail views the
`.mpp-innerpage--datetime` wrapper also contains the "Add to Calendar" button;
hiding it there removes that button too. The opportunity detail view has no such
button, so hiding it is safe.

## Files

Every file here is a verbatim copy of its `my.mcleanbible.org/CustomFiles/`
original unless noted. "Live source" is where the widget actually loads it from
today — repointing a page's `customcss` to the Pages URL is a manual edit in
WordPress.

| File | Widget | Pages using it | Live source |
| ---- | ------ | -------------- | ----------- |
| `CGsearch.css` | `mpp-group-finder` | `/testing-cg-group-finder/` | CustomFiles |
| `CleanOpp.css` | `mpp-opportunity-details` | `/opportunity-details/` | **Pages** |
| `Eventfindernotools.css` | `mpp-opportunity-finder`, `mpp-group-finder` | `/opportunity-finder/`, `/testeventfinder/`, `/testing-widget/` | Pages (`/opportunity-finder/`), CustomFiles (rest) |
| `Eventfindernotoolslandscape.css` | `mpp-event-finder` | `/testing-widget/` | CustomFiles |
| `EventDetails.css` | `mpp-event-details` | `/event-registration/` | CustomFiles |
| `GroupDetails.css` | `mpp-group-details` | `/mp-community-details/`, `/mp-group-details/` | CustomFiles |
| `Opptest.css` | `mpp-opportunity-details` | `/support-form/` | CustomFiles |
| `PublicationWidgetNoText.css` | `mpp-subscribe-to-publication` | `/21days2025/`, `/21daysconfirmation/`, `/car-chats/`, `/globaloutreach/`, `/localoutreach/`, `/text-subscribe/` | CustomFiles |

### What each one does

- **`CGsearch.css`** — hides unused search/advanced-search fields, forces the
  advanced search section open, hides the sign-up tab.
- **`CleanOpp.css`** — hides the form message, response form title, innerpage
  back link, map container, and the date/"Ongoing" row. Carries two
  commented-out blocks kept from the original.
- **`Eventfindernotools.css`** — hides the search/filter form wrapper, the group
  capacity subtitle, and the date/"Ongoing" row on finder cards. Despite the
  name it is not used with the event finder.
- **`Eventfindernotoolslandscape.css`** — the landscape/one-column variant:
  single-column card grid, no card header, grey card background, square
  corners, custom font stack.
- **`EventDetails.css`** — one rule, hiding the room display
  (`#detailsContainer > div:nth-child(3)`).
- **`GroupDetails.css`** — hides the group capacity and the sign-up tab.
- **`Opptest.css`** — a more aggressive variant of `CleanOpp.css`: hides the
  whole `.mpp-innerpage`, contacts wrapper, special text, response form title,
  and map container.
- **`PublicationWidgetNoText.css`** — theming for the subscribe widget (brand
  button colors, square buttons, no box shadow) plus hiding the innerpage and
  left-aligning centered text.

### Known quirks in the copied originals

- `GroupDetails.css` ends with a line of raw HTML (a `<div class="mpp-form--tabs"
  ...>` snippet) pasted below the rules. It is invalid CSS and is ignored by the
  parser, but it was left in place so this file stays a faithful copy.
- Several files open with the same commented-out `#searchForm` block, copied
  from one to the next over time.
- Selectors such as `#detailsContainer > div:nth-child(3)` and
  `div > div > div.mppw-form-wrapper` are positional and will break if MP
  changes the widget markup.
