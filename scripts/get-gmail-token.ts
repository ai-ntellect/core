import { google } from 'googleapis';
import http from 'http';
import { parse } from 'url';
import fs from 'fs';
import open from 'open';

const CLIENT_SECRET_PATH = './client_secret.json';
const TOKEN_PATH = './gmail_token.json';

async function getToken() {
  const credentials = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf8'));
  const { client_id, client_secret } = credentials.web;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:3000/oauth2callback'
  );

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
  ];

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  console.log('Opening browser for authorization...');
  console.log('URL:', authorizeUrl);

  await open(authorizeUrl);

  const server = http.createServer(async (req, res) => {
    const queryParams = parse(req.url!, true).query;
    const code = queryParams.code as string;

    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful!</h1><p>You can close this window.</p>');

        console.log('Token saved to', TOKEN_PATH);
        server.close();
        process.exit(0);
      } catch (error) {
        console.error('Error getting tokens:', error);
        res.writeHead(500);
        res.end('Error');
        process.exit(1);
      }
    }
  });

  server.listen(3000, () => {
    console.log('Listening on http://localhost:3000');
  });
}

getToken().catch(console.error);
