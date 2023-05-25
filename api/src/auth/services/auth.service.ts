import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';
import { Observable, from, map, switchMap } from 'rxjs';
import { User } from '../models/user.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from '../models/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private jwtService: JwtService,
  ) {}

  hashPassword(password: string): Observable<string> {
    return from(bcrypt.hash(password, 12)); //convert promise to observable
  }

  validateUser(email: string, password: string): Observable<User> {
    return from(
      this.userRepository.findOne({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          password: true,
          role: true,
          isPrivateAccount: true,
        },
        where: { email },
      }),
    ).pipe(
      switchMap((user: User) =>
        from(bcrypt.compare(password, user.password)).pipe(
          map((isValidPassword: boolean) => {
            if (isValidPassword) {
              delete user.password;
              return user;
            }
          }),
        ),
      ),
    );
  }

  registerAccount(user: User): Observable<string> {
    const { firstName, lastName, email, password, isPrivateAccount } = user;

    return this.hashPassword(password).pipe(
      switchMap((hashedPassword: string) => {
        return from(
          this.userRepository.save({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            isPrivateAccount,
            subscribers: !isPrivateAccount ? 0 : null,
          }),
        ).pipe(
          switchMap(() => {
            return from(
              this.validateUser(email, password).pipe(
                switchMap((user: User) => {
                  if (user) {
                    //create JWT - credentials
                    return from(this.jwtService.signAsync({ user }));
                  }
                }),
              ),
            );
          }),
        );
      }),
    );
  }

  login(user: User): Observable<string> {
    const { email, password } = user;
    return this.validateUser(email, password).pipe(
      switchMap((user: User) => {
        if (user) {
          //create JWT - credentials
          return from(this.jwtService.signAsync({ user }));
        }
      }),
    );
  }
}
