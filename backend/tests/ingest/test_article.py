from __future__ import annotations

from core.article import ArticleParagraph, extract_article


HTML = """
<html><head>
<title>Fallback title</title>
<meta property="og:title" content="The Real Story">
<meta property="og:site_name" content="Example Journal">
<meta property="article:published_time" content="2026-09-19T10:00:00Z">
<link rel="canonical" href="https://example.test/articles/42">
</head><body>
<nav>Home Subscribe</nav><article>
<h1>The Real Story</h1><p class="byline">By Ada Lovelace</p>
<h2>Background</h2><p>First paragraph with <b>useful</b> facts.</p>
<p>Second paragraph&nbsp;with a link and normal spacing.</p>
<div class="advertisement">Buy this now</div><script>bad()</script>
<h2>Conclusion</h2><p>The final finding is clear.</p>
</article><footer>Copyright</footer>
</body></html>
"""


def test_extracts_metadata_and_heading_associated_paragraphs():
    article = extract_article(HTML, url="https://example.test/other")

    assert article.title == "The Real Story"
    assert article.canonical == "https://example.test/articles/42"
    assert article.site == "Example Journal"
    assert article.byline == "Ada Lovelace"
    assert article.published == "2026-09-19T10:00:00Z"
    assert article.paragraphs == (
        ArticleParagraph("First paragraph with useful facts.", "Background", 0),
        ArticleParagraph("Second paragraph with a link and normal spacing.", "Background", 1),
        ArticleParagraph("The final finding is clear.", "Conclusion", 2),
    )


def test_extracts_plain_document_and_drops_boilerplate():
    article = extract_article(
        "<html><body><h1>Notes</h1><p>One.</p><aside>Related links</aside>"
        "<p>Two.</p></body></html>"
    )
    assert [paragraph.text for paragraph in article.paragraphs] == ["One.", "Two."]
    assert article.site is None


def test_paragraph_text_does_not_contaminate_following_heading():
    article = extract_article(
        "<h2>Methods</h2><p>Paragraph text must stay out of heading state.</p>"
        "<h2>Results</h2><p>Observed result.</p>"
    )
    assert [item.heading for item in article.paragraphs] == ["Methods", "Results"]


def test_void_elements_inside_boilerplate_do_not_swallow_content():
    article = extract_article(
        "<html><body><nav>Home<br>Subscribe</nav>"
        "<p>Real content here.</p>"
        '<div class="advertisement">Buy<img src="x"> now</div>'
        "<p>Kept paragraph.</p></body></html>"
    )
    assert [paragraph.text for paragraph in article.paragraphs] == [
        "Real content here.",
        "Kept paragraph.",
    ]
