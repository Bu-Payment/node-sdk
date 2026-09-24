export interface Customer {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerBody {
  email: string;
  name?: string;
}

export interface UpdateCustomerBody {
  email?: string;
  name?: string | null;
}

export type ListCustomersQuery = {
  limit?: number;
  cursor?: string;
  email?: string;
};
