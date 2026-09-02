const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');

const CONTAINER_NAME = process.env.BLOB_CONTAINER_NAME || 'words';
const BLOB_NAME = process.env.BLOB_FILE_NAME || 'word_trails.txt';
const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

// Helper to get BlobClient
function getBlobClient() {
  if (!CONNECTION_STRING) {
    return null;
  }
  const blobServiceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  return containerClient.getBlockBlobClient(BLOB_NAME);
}

// Helper to stream/read blob content to UTF-8 string
async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    readableStream.on('error', reject);
  });
}

// Fallback to local file if running in local environment without blob storage configured
function getLocalFallbackWords() {
  const possiblePaths = [
    path.resolve(__dirname, '../../../../word_trails.txt'),
    path.resolve(__dirname, '../../../word_trails.txt'),
    path.resolve(process.cwd(), 'word_trails.txt'),
    path.resolve(process.cwd(), '../word_trails.txt')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  }
  return null;
}

// GET /api/words - Return word list
app.http('getWords', {
  methods: ['GET'],
  route: 'words',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    context.log('Handling GET /api/words request');

    try {
      const blobClient = getBlobClient();
      let content = null;

      if (blobClient) {
        const exists = await blobClient.exists();
        if (exists) {
          const downloadResponse = await blobClient.download();
          content = await streamToString(downloadResponse.readableStreamBody);
        } else {
          // If blob container exists but file not seeded, try seeding from local fallback
          const localFallback = getLocalFallbackWords();
          if (localFallback) {
            context.log('Seeding blob storage from local word_trails.txt');
            await blobClient.upload(localFallback, Buffer.byteLength(localFallback, 'utf-8'), {
              blobHTTPHeaders: { blobContentType: 'text/plain; charset=utf-8' }
            });
            content = localFallback;
          }
        }
      }

      if (!content) {
        content = getLocalFallbackWords();
      }

      if (!content) {
        return {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Word list not found in blob storage or local filesystem.' })
        };
      }

      return {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
        },
        body: content
      };
    } catch (err) {
      context.error('Error fetching word list:', err);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal server error fetching word list', details: err.message })
      };
    }
  }
});

// DELETE /api/words - Delete a word from the mutable blob storage
app.http('deleteWord', {
  methods: ['DELETE', 'POST'],
  route: 'words',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    context.log('Handling DELETE /api/words request');

    try {
      let targetWord = request.query.get('word');

      if (!targetWord && request.headers.get('content-type')?.includes('application/json')) {
        try {
          const jsonBody = await request.json();
          targetWord = jsonBody?.word;
        } catch (_) {
          // ignore JSON parse error, handled below
        }
      }

      if (!targetWord || typeof targetWord !== 'string') {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing or invalid "word" parameter.' })
        };
      }

      const normalizedTarget = targetWord.trim().toLowerCase();
      if (!normalizedTarget) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Word cannot be empty.' })
        };
      }

      const blobClient = getBlobClient();
      if (!blobClient) {
        return {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Storage connection not configured.' })
        };
      }

      const exists = await blobClient.exists();
      let currentContent = '';
      if (exists) {
        const downloadResponse = await blobClient.download();
        currentContent = await streamToString(downloadResponse.readableStreamBody);
      } else {
        const localFallback = getLocalFallbackWords();
        if (localFallback) {
          currentContent = localFallback;
        } else {
          return {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Word list blob not initialized.' })
          };
        }
      }

      const lines = currentContent.split('\n');
      const filteredLines = [];
      let found = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.toLowerCase() === normalizedTarget) {
          found = true;
        } else if (trimmed) {
          filteredLines.push(trimmed);
        }
      }

      if (!found) {
        return {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            word: normalizedTarget,
            message: `Word "${normalizedTarget}" was not found in the word list.`
          })
        };
      }

      const updatedContent = filteredLines.join('\n') + '\n';

      // Upload updated word list to blob
      await blobClient.upload(updatedContent, Buffer.byteLength(updatedContent, 'utf-8'), {
        blobHTTPHeaders: { blobContentType: 'text/plain; charset=utf-8' }
      });

      context.log(`Word "${normalizedTarget}" successfully deleted. Remaining words: ${filteredLines.length}`);

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          word: normalizedTarget,
          remainingCount: filteredLines.length,
          message: `Word "${normalizedTarget}" deleted successfully.`
        })
      };
    } catch (err) {
      context.error('Error deleting word:', err);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal server error deleting word', details: err.message })
      };
    }
  }
});
