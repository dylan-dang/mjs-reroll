import path from 'path';
import process from 'process';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import credentials from '../credentials.json' with {type: 'json'};

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const tokenFile = Bun.file('.cache/token.json');

export async function loadSavedCredentialsIfExist() {
  try {
    const token = await tokenFile.json();
    return google.auth.fromJSON(token) as OAuth2Client | null;
  } catch {
    return null;
  }
}

export async function saveCredentials(client: OAuth2Client) {
  const key = credentials.installed;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await Bun.write(tokenFile, payload);
}

export async function loadOrAuthenticate() {
  const savedClient = await loadSavedCredentialsIfExist();
  if (savedClient) return savedClient;

  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: path.join(process.cwd(), 'credentials.json'),
  });

  if (client.credentials) await saveCredentials(client);
  return client;
}

export async function getGmailClient() {
  const auth  = await loadOrAuthenticate();
  return google.gmail({ version: 'v1', auth });
}