import { createProject, getProjectById, listProjects, updateProject } from '../services/projectService.js';
import { assertNonNegativeNumber, assertRequiredString } from '../utils/validation.js';

export async function createProjectHandler(req, res, next) {
  try {
    assertRequiredString(req.body.name, 'name');
    assertNonNegativeNumber(req.body.discount_percent || 0, 'discount_percent');
    assertNonNegativeNumber(req.body.tax_percent || 0, 'tax_percent');
    const project = await createProject(req.body);
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
}

export async function listProjectsHandler(_req, res, next) {
  try {
    const projects = await listProjects();
    res.json(projects);
  } catch (error) {
    next(error);
  }
}

export async function getProjectHandler(req, res, next) {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json(project);
  } catch (error) {
    return next(error);
  }
}

export async function updateProjectHandler(req, res, next) {
  try {
    assertRequiredString(req.body.name, 'name');
    assertNonNegativeNumber(req.body.discount_percent || 0, 'discount_percent');
    assertNonNegativeNumber(req.body.tax_percent || 0, 'tax_percent');
    const project = await updateProject(req.params.id, req.body);
    res.json(project);
  } catch (error) {
    next(error);
  }
}
