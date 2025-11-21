// src/services/usersService.ts
import { User } from '../interfaces/User';
import * as usersDao from '../dao/users.dao';
import { UserSystemDesignStats } from '../interfaces/UserSDStats';
import * as systemDesignService from './system-design.service';

export async function findUserByEmail(email: string): Promise<User | null> {
  const userByEmail = await usersDao.findUserByEmail(email);
  return userByEmail;
}

export async function getAllUsers(): Promise<User[]> {
  const allUsers = await usersDao.getAllUsers();
  return allUsers;
}

export async function createUser(email: string, name?: string): Promise<User> {
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new Error('User already exists');
  }
  return await usersDao.createUser(email, name);
}

export async function getSystemDesignStatsForUserEmail(
  email: string
): Promise<UserSystemDesignStats> {
  const user = await usersDao.findUserByEmail(email);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const stats = await systemDesignService.getUserSystemDesignStats(user.id);
  return stats;
}

export async function createStudyPlanForUserByEmail(email: string) {
  const user = await usersDao.findUserByEmail(email);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  return await systemDesignService.getSystemDesignPlanForUser(user.id);
}