# Rendered reference review

Coordinator browser inspection on 30 September 2026 supplements the text research in `docs/DESIGN.md`. Live Thirdway, Driftime's 2025 report and Vercel Ship returned HTTP 200 and were rendered at 1440 × 1000. The first Thirdway capture showed a loader; a subsequent capture after normal load and wheel scrolling showed its actual body. Driftime and Vercel emitted a hydration warning during this inspection. These are reference observations, not AxionBench acceptance evidence. No reference screenshots or artwork are shipped with the product.

## Observed components and useful principles

- [Thirdway](https://www.thirdway.com/) moves from a horizontal strip of imagery into a large, spacious statement, then another broad visual area. Its fixed central navigation is compact. Carry forward the shift in scale and breathing room between chapters. AxionBench uses its own sans typography, cool reading surfaces and analytical diagrams.
- [Driftime 2025](https://2025.driftime.com/) places a narrow reading column over an oversized typographic background, with a persistent chapter/progress indicator. Carry forward the contrast between a clear reading column and a strong surrounding composition, plus a concise chapter index. Data labels and axes must remain unobscured; decorative type stops outside analytical marks.
- [Vercel Ship](https://vercel.com/ship) uses restrained rules, an asymmetric list/visual stage, a large quiet gap, then a three-column section opening. Carry forward a shared underlying grid with different section compositions. AxionBench's analytical controls remain readable and distinct from subdued secondary metadata.

## AxionBench implementation decisions

Preserve the animated contour hero, including its existing motion behavior. Give the remaining page a deliberately different rhythm:

1. A mineral frontier chapter with an expressive 48–64 px section heading, a short explanation, a compact control rail and one generous primary plot. Show its selected metric, source tier and measurement date at first use. Avoid a small sidebar heading beside an otherwise generic dashboard card.
2. A graphite paired comparison stage, with balanced model identities and aligned shared-scale marks. Keep a clear visual centre and generous space around the actual comparison.
3. An open-weight chapter organized around a horizontal size ruler and a bounded selected-band cohort. Total parameters define the bands; activated parameters are a separate measurement. Use small multiples or concise rows where they clarify the shape.
4. A compact but readable full directory, reached through search and filters, with stable table hierarchy and generous section margins. The completeness of the directory must not produce hundreds of series on the main chart.
5. A methods chapter with an editorial reading column, inspectable coverage and source detail, and a contrasting measurement accent. Keep evidence available without letting every caveat dominate the main composition.

Use locally licensed Space Grotesk, DM Sans and IBM Plex Mono consistently. Keep the graphite/mineral/cobalt/lime palette from the blueprint. Reserve lime for selection and hero highlights, cobalt for measurements and links, and dark surfaces for focused comparisons. Thin rules and aligned typography organize content; repeated rounded tiles must not become the whole page.

Treat mark readability, hierarchy and whitespace as acceptance criteria. Inspect full-page and section captures at the specified desktop/mobile widths after genuine interactions. Motion should explain sorting, filtering and selection. Reduced motion must keep the same values and controls. A successful compile or isolated component test does not establish the finished visual quality.
