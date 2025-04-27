export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Lägg till denna rad!
  
  const crypto = require('crypto');
  const secretKey = 'Bz0J0G_zT-h47thwLoa8DB5tCQFM-zjbNd8celcu'; // <-- Din riktiga secret key!

  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const hmac = crypto.createHmac('sha256', secretKey)
                     .update(userId.toString())
                     .digest('hex');

  res.status(200).json({ user_hash: hmac });
}
