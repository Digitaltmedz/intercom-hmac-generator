export default function handler(req, res) {
  const crypto = require('crypto');

  const secretKey = 'Bz0J0G_zT-h47thwLoa8DB5tCQFM-zjbNd8celcu'; // <-- Byt ut till din riktiga Secret Key!

  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const hmac = crypto.createHmac('sha256', secretKey)
                     .update(userId.toString())
                     .digest('hex');

  res.status(200).json({ user_hash: hmac });
}
