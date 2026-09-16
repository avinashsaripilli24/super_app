export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      asset_categories: {
        Row: {
          asset_class: Database["public"]["Enums"]["asset_class"] | null
          color: string
          created_at: string
          icon: string
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          name: string
          sort_order: number
          user_id: string | null
          valuation_mode: Database["public"]["Enums"]["valuation_mode"]
        }
        Insert: {
          asset_class?: Database["public"]["Enums"]["asset_class"] | null
          color?: string
          created_at?: string
          icon?: string
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          name: string
          sort_order?: number
          user_id?: string | null
          valuation_mode?: Database["public"]["Enums"]["valuation_mode"]
        }
        Update: {
          asset_class?: Database["public"]["Enums"]["asset_class"] | null
          color?: string
          created_at?: string
          icon?: string
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          name?: string
          sort_order?: number
          user_id?: string | null
          valuation_mode?: Database["public"]["Enums"]["valuation_mode"]
        }
        Relationships: []
      }
      asset_targets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_targets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          id: string
          month: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          id?: string
          month: string
          user_id?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          id?: string
          month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          kind: Database["public"]["Enums"]["txn_kind"]
          name: string
          sort_order: number
          user_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          kind?: Database["public"]["Enums"]["txn_kind"]
          name: string
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          kind?: Database["public"]["Enums"]["txn_kind"]
          name?: string
          sort_order?: number
          user_id?: string | null
        }
        Relationships: []
      }
      holding_transactions: {
        Row: {
          amount: number
          created_at: string
          holding_id: string
          id: string
          interest_amount: number | null
          note: string | null
          occurred_on: string
          quantity: number | null
          type: Database["public"]["Enums"]["holding_txn_type"]
          unit_price: number | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          holding_id: string
          id?: string
          interest_amount?: number | null
          note?: string | null
          occurred_on?: string
          quantity?: number | null
          type: Database["public"]["Enums"]["holding_txn_type"]
          unit_price?: number | null
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          holding_id?: string
          id?: string
          interest_amount?: number | null
          note?: string | null
          occurred_on?: string
          quantity?: number | null
          type?: Database["public"]["Enums"]["holding_txn_type"]
          unit_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holding_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_valuations: {
        Row: {
          as_of: string
          created_at: string
          holding_id: string
          id: string
          note: string | null
          unit_price: number | null
          user_id: string
          value: number
        }
        Insert: {
          as_of?: string
          created_at?: string
          holding_id: string
          id?: string
          note?: string | null
          unit_price?: number | null
          user_id?: string
          value: number
        }
        Update: {
          as_of?: string
          created_at?: string
          holding_id?: string
          id?: string
          note?: string | null
          unit_price?: number | null
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "holding_valuations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holding_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_valuations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          category_id: string
          closed_on: string | null
          created_at: string
          holder_id: string | null
          id: string
          identifier: string | null
          institution: string | null
          interest_rate: number | null
          maturity_on: string | null
          name: string
          notes: string | null
          opened_on: string | null
          status: Database["public"]["Enums"]["holding_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          closed_on?: string | null
          created_at?: string
          holder_id?: string | null
          id?: string
          identifier?: string | null
          institution?: string | null
          interest_rate?: number | null
          maturity_on?: string | null
          name: string
          notes?: string | null
          opened_on?: string | null
          status?: Database["public"]["Enums"]["holding_status"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          category_id?: string
          closed_on?: string | null
          created_at?: string
          holder_id?: string | null
          id?: string
          identifier?: string | null
          institution?: string | null
          interest_rate?: number | null
          maturity_on?: string | null
          name?: string
          notes?: string | null
          opened_on?: string | null
          status?: Database["public"]["Enums"]["holding_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          day_of_month: number
          id: string
          note: string | null
          payment_method: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          day_of_month: number
          id?: string
          note?: string | null
          payment_method?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number
          id?: string
          note?: string | null
          payment_method?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          earned_by: string | null
          id: string
          kind: Database["public"]["Enums"]["txn_kind"]
          note: string | null
          occurred_on: string
          payment_method: string | null
          recurring_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          currency?: string
          earned_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["txn_kind"]
          note?: string | null
          occurred_on?: string
          payment_method?: string | null
          recurring_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          earned_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["txn_kind"]
          note?: string | null
          occurred_on?: string
          payment_method?: string | null
          recurring_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      holding_current: {
        Row: {
          asset_class: Database["public"]["Enums"]["asset_class"] | null
          category_color: string | null
          category_icon: string | null
          category_id: string | null
          category_name: string | null
          closed_on: string | null
          created_at: string | null
          current_value: number | null
          gain: number | null
          holder_id: string | null
          id: string | null
          identifier: string | null
          income: number | null
          institution: string | null
          interest_paid: number | null
          interest_rate: number | null
          invested: number | null
          kind: Database["public"]["Enums"]["asset_kind"] | null
          last_txn_on: string | null
          last_valued_on: string | null
          maturity_on: string | null
          name: string | null
          notes: string | null
          opened_on: string | null
          status: Database["public"]["Enums"]["holding_status"] | null
          txn_count: number | null
          unit_price: number | null
          units_held: number | null
          updated_at: string | null
          user_id: string | null
          valuation_mode: Database["public"]["Enums"]["valuation_mode"] | null
          withdrawn: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_names: {
        Row: {
          email: string | null
          full_name: string | null
          id: string | null
          phone: string | null
        }
        Insert: {
          email?: string | null
          full_name?: string | null
          id?: string | null
          phone?: string | null
        }
        Update: {
          email?: string | null
          full_name?: string | null
          id?: string | null
          phone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assets_activity: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      assets_overview: { Args: { p_holder?: string }; Returns: Json }
      holding_value_at: {
        Args: {
          p_holding: string
          p_kind: Database["public"]["Enums"]["asset_kind"]
          p_mode: Database["public"]["Enums"]["valuation_mode"]
          p_on: string
        }
        Returns: {
          current_value: number
          last_valued_on: string
          unit_price: number
          units_held: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      ledger_summary: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      networth_history: { Args: { p_year: number }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      asset_class: "equity" | "debt" | "cash" | "gold" | "real_estate" | "other"
      asset_kind: "asset" | "debt"
      holding_status: "active" | "closed"
      holding_txn_type:
        | "invest"
        | "redeem"
        | "income"
        | "bonus"
        | "borrow"
        | "repay"
        | "charge"
      txn_kind: "expense" | "income"
      valuation_mode: "units" | "value"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "user"],
      asset_class: ["equity", "debt", "cash", "gold", "real_estate", "other"],
      asset_kind: ["asset", "debt"],
      holding_status: ["active", "closed"],
      holding_txn_type: [
        "invest",
        "redeem",
        "income",
        "bonus",
        "borrow",
        "repay",
        "charge",
      ],
      txn_kind: ["expense", "income"],
      valuation_mode: ["units", "value"],
    },
  },
} as const

