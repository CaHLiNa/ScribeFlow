// GET /api/v1/auth/github/connect?state=xxx&transport=poll|deep-link
// Redirects to GitHub OAuth consent screen
// Uses a signed state payload so callback verification works across server instances

import { createSignedOAuthState } from '../../../../utils/githubOAuthState.js'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const state = query.state
  const transport = query.transport === 'deep-link' ? 'deep-link' : 'poll'

  if (!state) {
    setResponseStatus(event, 400)
    return { error: 'State parameter is required' }
  }

  const config = useRuntimeConfig()
  const clientId = config.githubClientId

  if (!clientId) {
    setResponseStatus(event, 500)
    return { error: 'GitHub OAuth not configured' }
  }

  const redirectUri = `${config.baseUrl}/api/v1/auth/github/callback`
  const scope = 'repo read:user user:email'
  const signedState = createSignedOAuthState({ originalState: state, transport }, config)

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(signedState)}`

  return sendRedirect(event, url)
})
