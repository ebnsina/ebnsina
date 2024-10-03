---
title: Validating React Forms with react-hook-form and zod
date: '2024-03-15'
tags: ['react', 'react-hook-form', 'zod', 'validation']
excerpt: Validating React Forms with react-hook-form and zod
---

# Validating React Forms with react-hook-form and zod

Form validation is a crucial aspect of any web application. With React, libraries like react-hook-form and zod make it easier to manage form states and validations effectively. In this post, we will explore how to use these libraries together to create a robust form validation solution in your React application.

## Why Use react-hook-form and zod?

react-hook-form simplifies form handling in React by reducing the need for boilerplate code. It provides an easy way to manage form state and handle validation seamlessly.
zod is a TypeScript-first schema declaration and validation library. It allows you to define your data validation rules declaratively, making it easier to manage and maintain.

## Install those packages

```bash
npm install react-hook-form zod @hookform/resolvers
```

## Creating a Simple Form with Validation

```jsx
import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

// Define a schema for the form validation
const schema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

type FormData = z.infer<typeof schema>;

const MyForm: React.FC = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label>Email:</label>
        <input type="email" {...register("email")} />
        {errors.email && <p>{errors.email.message}</p>}
      </div>

      <div>
        <label>Password:</label>
        <input type="password" {...register("password")} />
        {errors.password && <p>{errors.password.message}</p>}
      </div>

      <button type="submit">Submit</button>
    </form>
  );
};

export default MyForm;
```

## Explanation

Schema Definition: We define a schema using zod to specify the validation rules for our form fields.
useForm Hook: We use the useForm hook from react-hook-form, passing the zodResolver to connect our schema.
Error Handling: The errors from validation are displayed under their respective fields when the validation fails.

## Conclusion

By leveraging react-hook-form and zod, you can build forms that are not only easy to manage but also robust in terms of validation. This combination simplifies form handling in React, making your code cleaner and easier to maintain.

For more information, check out the official documentation of react-hook-form and zod.

Happy coding!
