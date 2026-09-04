from core import search


def test_parses_terms_and_phrases():
    q = search.parse_query('plant "carbon cycle" photosynthesis')
    assert q.terms == ["plant", "photosynthesis"]
    assert q.phrases == ["carbon cycle"]


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


def test_and_requires_all_terms():
    q = search.parse_query("alpha beta")
    assert search.score_chunk("alpha only here", q)[0] is False
    matched, score = search.score_chunk("alpha and beta together", q)
    assert matched and score >= 2


def test_phrase_required_when_given():
    q = search.parse_query('alpha "exact phrase"')
    assert search.score_chunk("alpha but no phrase", q)[0] is False
    matched, score = search.score_chunk("alpha before exact phrase", q)
    assert matched and score >= 7  # 2 term counts + 1 phrase bonus


def test_phrase_boost_beats_plain_terms():
    phrase_q = search.parse_query('"greenhouse gas emissions"')
    plain_q = search.parse_query("greenhouse gas emissions")
    text = "greenhouse gas emissions drive climate change. greenhouse gas emissions rise."
    matched_phrase, phrase_score = search.score_chunk(text, phrase_q)
    matched_plain, plain_score = search.score_chunk(text, plain_q)
    assert matched_phrase and matched_plain
    assert phrase_score > plain_score


def test_proximity_bonus_cluster_wins():
    q = search.parse_query("sunlight energy")
    close = "the plant absorbs sunlight to get energy quickly"
    apart = "sunlight is one thing but energy appears much later in this long text"
    _, close_score = search.score_chunk(close, q)
    _, apart_score = search.score_chunk(apart, q)
    assert close_score > apart_score