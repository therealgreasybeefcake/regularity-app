import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { AWS_CONFIG } from '../constants/aws-config';
import { AWSCredentials } from './AuthService';
import { Team } from '../types';

function createS3Client(credentials: AWSCredentials): S3Client {
  return new S3Client({
    region: AWS_CONFIG.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

export const S3SyncService = {
  async loadTeams(credentials: AWSCredentials): Promise<Team[] | null> {
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
      return data.teams || null;
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        // First run — no data in S3 yet
        return null;
      }
      console.error('Error loading teams from S3:', error);
      throw error;
    }
  },

  async saveTeams(credentials: AWSCredentials, teams: Team[]): Promise<void> {
    try {
      const client = createS3Client(credentials);
      const data = JSON.stringify({ teams, lastModified: new Date().toISOString() });

      await client.send(
        new PutObjectCommand({
          Bucket: AWS_CONFIG.s3Bucket,
          Key: 'teams.json',
          Body: data,
          ContentType: 'application/json',
        })
      );
    } catch (error) {
      console.error('Error saving teams to S3:', error);
      throw error;
    }
  },
};
