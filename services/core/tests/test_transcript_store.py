from realtime_system_transcriber.transcript_store import TranscriptStore


def test_transcript_store_normalizes_linebreaks_and_hyphenation() -> None:
    store = TranscriptStore()
    store.add("Reti-\nnib, Pakritinib and sorry\nthe state")
    assert store.full_text() == "Retinib, Pakritinib and sorry the state"


def test_transcript_store_normalizes_carriage_return_and_unicode_separator() -> None:
    store = TranscriptStore()
    store.add("line one\r\nline two\u2028line three")
    assert store.full_text() == "line one line two line three"


def test_transcript_store_concatenates_chunks_with_spaces() -> None:
    store = TranscriptStore()
    store.add("several strong candidates.")
    store.add("Identify drugs like binaum")
    store.add("is absolutely approved and used for scale.")
    assert store.full_text() == "several strong candidates. Identify drugs like binaum is absolutely approved and used for scale."


def test_transcript_store_merges_cross_chunk_hyphenation() -> None:
    store = TranscriptStore()
    store.add("same I-")
    store.add("idea repeated")
    assert store.full_text() == "same Iidea repeated"


def test_transcript_store_normalizes_literal_escaped_linebreaks() -> None:
    store = TranscriptStore()
    store.add("line one\\nline two\\r\\nline three")
    assert store.full_text() == "line one line two line three"
