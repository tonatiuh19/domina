import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import { authHeaders, formatAxiosError } from "@/lib/api";
import type { RootState } from "../index";

export interface CompanyRequest {
  id: number;
  title: string;
  headcount: number;
  notes: string | null;
  status: string;
  created_at: string;
}

interface CompanyState {
  requests: CompanyRequest[];
  loading: boolean;
  error: string | null;
}

const initialState: CompanyState = { requests: [], loading: false, error: null };

export const fetchCompanyRequests = createAsyncThunk(
  "company/requests",
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).adminAuth.token;
      const { data } = await axios.get("/api/admin/company/requests", { headers: authHeaders(token) });
      return data.requests as CompanyRequest[];
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const createCompanyRequest = createAsyncThunk(
  "company/create",
  async (
    body: { title: string; headcount: number; notes?: string },
    { getState, rejectWithValue },
  ) => {
    try {
      const token = (getState() as RootState).adminAuth.token;
      const { data } = await axios.post("/api/admin/company/requests", body, { headers: authHeaders(token) });
      return data.id as number;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

const companySlice = createSlice({
  name: "company",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCompanyRequests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCompanyRequests.fulfilled, (state, action) => {
        state.loading = false;
        state.requests = action.payload;
      })
      .addCase(fetchCompanyRequests.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload || "");
      })
      .addCase(createCompanyRequest.rejected, (state, action) => {
        state.error = String(action.payload || "");
      });
  },
});

export default companySlice.reducer;
