const BASE = 'http://localhost:3333'

/** A tiny one page PDF with a phrase on it, so the answer is checkable. */
function makePdf(phrase) {
  const body = `BT /F1 18 Tf 40 200 Td (${phrase}) Tj ET`
  return Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
      `4 0 obj<</Length ${body.length}>>stream`,
      body,
      'endstream endobj',
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
      'trailer<</Root 1 0 R>>',
    ].join('\n'),
    'utf8'
  )
}

/** A 2x2 red PNG. */
function makePng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAxMDAwMAAAAwBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64'
  )
}

let token = null

async function api(path, body, method = 'POST') {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json }
}

/** Reads an SSE stream into its frames. */
async function stream(body) {
  const res = await fetch(`${BASE}/api/conversations/${body.conversationId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: body.content, model: body.model, images: body.images, pdfs: body.pdfs }),
  })
  const raw = await res.text()
  let text = ''
  let done = null
  let error = null
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload) continue
    try {
      const frame = JSON.parse(payload)
      if (frame.token) text += frame.token
      if (frame.done) done = frame
      if (frame.error) error = frame.error
    } catch {}
  }
  return { status: res.status, text, done, error, raw: raw.slice(0, 400) }
}

const results = []

function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

console.log('=== setup ===')
const email = `pin-${Date.now()}@example.com`
let r = await api('/api/auth/register', {
  email,
  password: 'secret123',
  passwordConfirmation: 'secret123',
  fullName: 'Pin Tester',
})
check('register', r.status === 200 || r.status === 201, `status ${r.status}`)
token = r.json?.data?.token ?? r.json?.token
if (!token) {
  console.log('  register body:', JSON.stringify(r.json).slice(0, 300))
  process.exit(1)
}
console.log(`  user ${email}`)

r = await api('/api/conversations', { title: 'Pin test' })
const conversationId = r.json?.data?.id ?? r.json?.id
check('create conversation', Boolean(conversationId), `id ${conversationId}`)

console.log('\n=== 1. PDF via the pin path ===')
const phrase = 'Gemini Rock Paper Scissors'
r = await stream({
  conversationId,
  content: 'What phrase is written on this page? Reply with just the phrase.',
  pdfs: [{ name: 'note.pdf', data: makePdf(phrase).toString('base64') }],
})
check('PDF turn streams 200', r.status === 200, `status ${r.status}`)
check('PDF answer read from document', r.text.includes(phrase), JSON.stringify(r.text.trim().slice(0, 90)))
check('PDF turn has no error frame', !r.error, r.error ? JSON.stringify(r.error).slice(0, 120) : '')
check('PDF turn reports done', Boolean(r.done), r.done ? JSON.stringify(r.done).slice(0, 120) : 'no done frame')

r = await api(`/api/conversations/${conversationId}`, undefined, 'GET')
const stored = r.json?.data?.messages ?? []
const userMsg = stored.find((m) => m.role === 'user')
const atts = userMsg?.attachments ?? []
check('attachment persisted on the user message', atts.length === 1, JSON.stringify(atts))
check('attachment keeps the original name', atts[0]?.name === 'note.pdf', atts[0]?.name)
check('attachment reports application/pdf', atts[0]?.mimeType === 'application/pdf', atts[0]?.mimeType)
check('attachment size is measured', atts[0]?.size > 100, `${atts[0]?.size} bytes`)

console.log('\n=== 2. Image via the same pin ===')
r = await stream({
  conversationId,
  content: 'What single dominant colour is in this image? Reply with one word.',
  images: [{ mimeType: 'image/png', data: makePng().toString('base64') }],
})
check('image turn streams 200', r.status === 200, `status ${r.status}`)
check('image turn produced an answer', r.text.trim().length > 0, JSON.stringify(r.text.trim().slice(0, 90)))
check('image turn has no error frame', !r.error, r.error ? JSON.stringify(r.error).slice(0, 120) : '')

console.log('\n=== 3. Anything else must be refused ===')
r = await stream({
  conversationId,
  content: 'Read this.',
  pdfs: [{ name: 'notes.docx', data: Buffer.from('PK not a pdf').toString('base64') }],
})
check('a .docx named as a PDF is refused', r.status >= 400, `status ${r.status}`)

r = await stream({
  conversationId,
  content: 'Read this.',
  pdfs: [{ name: 'fake.pdf', data: Buffer.from('this is plain text, not a pdf at all').toString('base64') }],
})
check('a text file renamed .pdf is refused', r.status >= 400, `status ${r.status}`)

r = await stream({
  conversationId,
  content: 'Read this.',
  images: [{ mimeType: 'application/zip', data: 'UEsDBA==' }],
})
check('a zip is refused as an image', r.status >= 400, `status ${r.status}`)

r = await stream({
  conversationId,
  content: 'Read this.',
  images: [{ mimeType: 'image/bmp', data: 'Qk0eAAAAAAAAABo=' }],
})
check('an unsupported image type is refused', r.status >= 400, `status ${r.status}`)

r = await stream({ conversationId, content: 'Read this.', images: [], pdfs: [] })
check('a turn with no text and no files is refused', r.status >= 400, `status ${r.status}`)

const bigPdf = Buffer.concat([makePdf('x').subarray(0, 5), Buffer.alloc(9 * 1024 * 1024, 0x41)])
r = await stream({
  conversationId,
  content: 'Read this.',
  pdfs: [{ name: 'big.pdf', data: bigPdf.toString('base64') }],
})
check('a PDF over 8 MB is refused', r.status >= 400, `status ${r.status}`)

console.log('\n=== 4. Pinned file shows up in the transcript ===')
r = await api(`/api/conversations/${conversationId}`, undefined, 'GET')
const msgs = r.json?.data?.messages ?? []
const withAtt = msgs.filter((m) => (m.attachments ?? []).length > 0)
check('conversation detail lists the attachment', withAtt.length >= 1, `${withAtt.length} message(s) carry one`)

console.log(`\n${results.filter((x) => x.pass).length}/${results.length} passed`)
if (results.some((x) => !x.pass)) {
  console.log('\nFAILURES:')
  for (const x of results.filter((f) => !f.pass)) console.log(`  - ${x.name}  ${x.detail}`)
  process.exit(1)
}
