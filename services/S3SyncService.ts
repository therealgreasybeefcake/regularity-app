import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { AWS_CONFIG } from '../constants/aws-config';
import { AWSCredentials } from './AuthService';
import { Team, Session } from '../types';

function createS3Client(credentials: AWSCredentials): S3Client {
  return new S3Client({
    region: AWS_CONFIG.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export const S3SyncService = {
  /** Save team data (excludes sessionHistory) */
  async saveTeam(credentials: AWSCredentials, team: Team): Promise<void> {
    try {
      const client = createS3Client(credentials);
      const { sessionHistory, ...teamWithoutSessions } = team;
      const data = JSON.stringify({
        team: teamWithoutSessions,
        lastModified: new Date().toISOString(),
      });

      await client.send(
        new PutObjectCommand({
          Bucket: AWS_CONFIG.s3Bucket,
          Key: 'team.json',
          Body: data,
          ContentType: 'application/json',
        })
      );
    } catch (error) {
      console.error('Error saving team to S3:', error);
      throw error;
    }
  },

  /** Load team data */
  async loadTeam(credentials: AWSCredentials): Promise<Omit<Team, 'sessionHistory'> | null> {
    try {
      const client = createS3Client(credentials);
      const response = await client.send(
        new GetObjectCommand({
          Bucket: AWS_CONFIG.s3Bucket,
          Key: 'team.json',
        })
      );

      const body = await response.Body?.transformToString();
      if (!body) return null;

      const data = JSON.parse(body);
      return data.team || null;
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      console.error('Error loading team from S3:', error);
      throw error;
    }
  },

  /** Save a single session */
  async saveSession(credentials: AWSCredentials, session: Session): Promise<void> {
    try {
      const client = createS3Client(credentials);
      const data = JSON.stringify(session);

      await client.send(
        new PutObjectCommand({
          Bucket: AWS_CONFIG.s3Bucket,
          Key: `sessions/${session.id}.json`,
          Body: data,
          ContentType: 'application/json',
        })
      );
    } catch (error) {
      console.error('Error saving session to S3:', error);
      throw error;
    }
  },

  /** Load all sessions from S3 */
  async loadSessions(credentials: AWSCredentials): Promise<Session[]> {
    try {
      const client = createS3Client(credentials);

      const listResponse = await client.send(
        new ListObjectsV2Command({
          Bucket: AWS_CONFIG.s3Bucket,
          Prefix: 'sessions/',
        })
      );

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return [];
      }

      const sessions: Session[] = [];
      for (const obj of listResponse.Contents) {
        if (!obj.Key || !obj.Key.endsWith('.json')) continue;
        try {
          const response = await client.send(
            new GetObjectCommand({
              Bucket: AWS_CONFIG.s3Bucket,
              Key: obj.Key,
            })
          );
          const body = await response.Body?.transformToString();
          if (body) {
            sessions.push(JSON.parse(body));
          }
        } catch (err) {
          console.warn(`Failed to load session ${obj.Key}:`, err);
        }
      }

      // Sort by timestamp descending (newest first)
      sessions.sort((a, b) => b.timestamp - a.timestamp);
      return sessions;
    } catch (error) {
      console.error('Error loading sessions from S3:', error);
      throw error;
    }
  },

  /** Migrate from legacy teams.json to new format */
  async migrateFromLegacy(credentials: AWSCredentials): Promise<Team | null> {
    try {
      const client = createS3Client(credentials);
      const response = await client.send(
        new GetObjectCommand({
          Bucket: AWS_CONFIG.s3Bucket,
          Key: 'teams.json',
        })
      );

      const body = await response.Body?.transformToString();
      if (!body) return null;

      const data = JSON.parse(body);
      const teams: Team[] = data.teams;
      if (!teams || teams.length === 0) return null;

      // Use the first team (single-team app)
      const team = teams[0];
      const { sessionHistory, ...teamWithoutSessions } = team;

      // Save team data in new format
      await S3SyncService.saveTeam(credentials, team);

      // Save each session individually
      if (sessionHistory && sessionHistory.length > 0) {
        for (const session of sessionHistory) {
          await S3SyncService.saveSession(credentials, session);
        }
      }

      console.log('[S3Sync] Migration complete: teams.json → team.json + sessions/');
      return team;
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      console.error('Error migrating legacy data:', error);
      throw error;
    }
  },
};
