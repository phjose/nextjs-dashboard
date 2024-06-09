'use server'

import { z } from "zod";
import { sql } from "@vercel/postgres";
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({
      invalid_type_error: 'Please select a customer.',
    }),
    amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.'}),
    status: z.enum(['pending', 'paid'], {
      invalid_type_error: 'Please select an invoice status.',
    }),
    date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

// ACTION: Autheticate users
export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}


// ACTION: Create new invoice
export async function createInvoice(prevState: State, formData: FormData) {

    // Valida formulario usando Zod
    const validatedFields = CreateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    console.log(validatedFields);

    // Si la validacion de formulario falla, devuelve error. Si no continua.
    if (!validatedFields.success) {
      return {
        errors: validatedFields.error.flatten().fieldErrors,
        message: 'Missing Fields. Failed to Create Invoice.',
      };
    }

    // Prepara los datos para insertar
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100; // CONVIERTO LOS IMPORTES EN CENTIMOS PARA ELIMINAR JAVASCRIPT PUNTO FLOTANTE.
    const date = new Date().toISOString().split('T')[0]; // Crea nueva fecha.
    
    try {
      await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
      `;
    } catch (error) {
      return {message: "DataBase Error: Failed to create new invoice.",};
    }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}


// ACTION: Update new invoice
export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData
) {
    const validatedFields = UpdateInvoice.safeParse({
      customerId: formData.get('customerId'),
      amount: formData.get('amount'),
      status: formData.get('status'),
    });

    // Si la validacion de formulario falla, devuelve error. Si no continua.
    if (!validatedFields.success) {
      return {
        errors: validatedFields.error.flatten().fieldErrors,
        message: 'Missing Fields. Failed to Edit Invoice.',
      };
    }
   
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
   
    try {
      await sql`
        UPDATE invoices
        SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
        WHERE id = ${id}
      `;
   } catch (error ) {
      return {message: "DataBase Error: Failed to update invoice.",};
   }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
  }



 export async function deleteInvoice(id: string) {
  // Con esto puedo forzar un error.
  // throw new Error('My Failed to Delete Invoice Error');

  try  {  
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
    return {message: "Deleted invoice.",};
  } catch (error ) {
    return {message: "DataBase Error: Failed to delete invoice.",};
  }
}