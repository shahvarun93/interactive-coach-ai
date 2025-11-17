// src/services/usersService.ts
import { User } from '../interfaces/User';
import * as usersDao from '../dao/users.dao';

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