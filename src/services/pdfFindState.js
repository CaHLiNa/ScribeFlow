export function normalizePdfFindMatchesCount(matchesCount) {
  const rawCurrent = Number.parseInt(matchesCount?.current ?? 0, 10)
  const rawTotal = Number.parseInt(matchesCount?.total ?? 0, 10)

  const total = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : 0
  let current = Number.isFinite(rawCurrent) && rawCurrent > 0 ? rawCurrent : 0

  if (total === 0) {
    current = 0
  } else if (current > total) {
    current = total
  }

  return { current, total }
}

export function mapPdfFindControlState(
  { state, previous = false, matchesCount = null, rawQuery = '' } = {},
  {
    pendingState,
    foundState,
    notFoundState,
    wrappedState,
  } = {},
) {
  const normalizedMatchesCount = normalizePdfFindMatchesCount(matchesCount)
  const query = String(rawQuery || '').trim()

  if (!query) {
    return {
      mode: 'idle',
      pending: false,
      notFound: false,
      wrapped: false,
      wrappedPrevious: false,
      matchesCount: normalizedMatchesCount,
      query,
    }
  }

  if (state === pendingState) {
    return {
      mode: 'pending',
      pending: true,
      notFound: false,
      wrapped: false,
      wrappedPrevious: false,
      matchesCount: normalizedMatchesCount,
      query,
    }
  }

  if (state === notFoundState) {
    return {
      mode: 'not_found',
      pending: false,
      notFound: true,
      wrapped: false,
      wrappedPrevious: false,
      matchesCount: normalizedMatchesCount,
      query,
    }
  }

  if (state === wrappedState) {
    return {
      mode: 'wrapped',
      pending: false,
      notFound: false,
      wrapped: true,
      wrappedPrevious: !!previous,
      matchesCount: normalizedMatchesCount,
      query,
    }
  }

  if (state === foundState) {
    return {
      mode: 'found',
      pending: false,
      notFound: false,
      wrapped: false,
      wrappedPrevious: false,
      matchesCount: normalizedMatchesCount,
      query,
    }
  }

  return {
    mode: 'idle',
    pending: false,
    notFound: false,
    wrapped: false,
    wrappedPrevious: false,
    matchesCount: normalizedMatchesCount,
    query,
  }
}
