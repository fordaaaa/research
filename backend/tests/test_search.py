from core import search


def test_parses_terms_and_phrases():
    q = search.parse_query('plant "carbon cycle" photosynthesis')
    assert q.terms == ["plant", "photosynthesi"]
    assert q.phrases == ["carbon cycle"]
    assert q.original_terms == ["plant", "photosynthesis"]


def test_phrase_strips_punctuation():
    q = search.parse_query('"carbon-cycle!"')
    assert q.phrases == ["carbon cycle"]
    assert q.terms == []


def test_empty_query_raises():
    try:
        search.parse_query('""')
        assert False, "expected EmptyQuery"
    except search.EmptyQuery:
        pass


def test_stopwords_dropped_at_parse():
    # "the" / "of" / "is" should not appear in q.terms
    q = search.parse_query("the mitochondria of the cell is the powerhouse")
    # "mitochondria", "cell", "powerhouse" have no droppable suffix in our
    # 30-line stemmer, so they stem to themselves.
    assert q.terms == ["mitochondria", "cell", "powerhouse"]
    assert q.original_terms == ["mitochondria", "cell", "powerhouse"]
    # and nothing in the stopword list leaked through
    assert not (set(q.terms) & search.STOPWORDS)


def test_stemmer_collapses_regular_inflections():
    # The stemmer handles the regular English inflections, not every irregular.
    assert search.stem("walking") == "walk"
    assert search.stem("walked") == "walk"
    assert search.stem("walks") == "walk"
    assert search.stem("happily") == "happi"
    assert search.stem("darkness") == "dark"
    # words that have no droppable suffix pass through (lowercased)
    assert search.stem("cell") == "cell"
    assert search.stem("powerhouse") == "powerhouse"


def test_stem_query_matches_inflected_text():
    # Query uses base form; corpus has inflected form. Stemmer collapses them
    # so a search for "walk" matches "walked" / "walking" / "walks".
    q = search.parse_query("walk")
    for body in ["She walked home.", "Walking is healthy.", "He walks daily."]:
        matched, score, _ = search.score_chunk(body, q)
        assert matched and score > 0, body


def test_idf_weights_rare_term_more_than_common_term():
    df = {"cell": 1000, "mitochondria": 1}
    _, rare_score, _ = search.score_chunk(
        "mitochondria", search.parse_query("mitochondria"), df=df, n_docs=1000
    )
    _, common_score, _ = search.score_chunk(
        "cell", search.parse_query("cell"), df=df, n_docs=1000
    )
    assert rare_score > common_score


def test_idf_disabled_keeps_old_behavior():
    # Backwards compat: passing df=None must match raw-tf behavior so any
    # caller (tests, ad-hoc scripts) that doesn't pre-compute df still works.
    q = search.parse_query("alpha beta")
    _, s_no_df, _ = search.score_chunk("alpha alpha beta", q, df=None)
    _, s_empty_df, _ = search.score_chunk("alpha alpha beta", q, df={})
    assert s_no_df == s_empty_df


def test_and_requires_all_terms():
    q = search.parse_query("alpha beta")
    matched, _, _ = search.score_chunk("alpha only here", q)
    assert matched is False
    matched, score, _ = search.score_chunk("alpha and beta together", q)
    assert matched and score >= 2


def test_phrase_required_when_given():
    q = search.parse_query('alpha "exact phrase"')
    matched, _, _ = search.score_chunk("alpha but no phrase", q)
    assert matched is False
    matched, score, _ = search.score_chunk("alpha before exact phrase", q)
    assert matched and score >= 7  # 2 term counts + 1 phrase bonus


def test_phrase_boost_beats_plain_terms():
    phrase_q = search.parse_query('"greenhouse gas emissions"')
    plain_q = search.parse_query("greenhouse gas emissions")
    text = "greenhouse gas emissions drive climate change. greenhouse gas emissions rise."
    matched_phrase, phrase_score, _ = search.score_chunk(text, phrase_q)
    matched_plain, plain_score, _ = search.score_chunk(text, plain_q)
    assert matched_phrase and matched_plain
    assert phrase_score > plain_score


def test_proximity_bonus_cluster_wins():
    q = search.parse_query("sunlight energy")
    close = "the plant absorbs sunlight to get energy quickly"
    apart = "sunlight is one thing but energy appears much later in this long text"
    _, close_score, _ = search.score_chunk(close, q)
    _, apart_score, _ = search.score_chunk(apart, q)
    assert close_score > apart_score


def test_score_chunk_returns_matched_stems():
    q = search.parse_query("plant photosynthesis")
    _, _, stems = search.score_chunk("plant photosynthesis drives growth", q)
    assert set(stems) == {"plant", "photosynthesi"}
