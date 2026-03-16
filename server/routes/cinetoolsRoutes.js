import { Router } from 'express';

const router = Router();

router.get('/dashboard', (req, res) => {
  res.json({
    ok: true,
    project: 'cinetools',
    user: req.projectAuth || null,
    message: 'CineTools private API area is ready.'
  });
});

export default router;
