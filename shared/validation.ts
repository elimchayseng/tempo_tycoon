import type {
  SendRequest,
  BatchRequest,
  HistoryRequest,
  ValidationResult,
  ValidationError
} from './types.js';

const ACCOUNT_LABELS = ['alice', 'bob', 'merchant', 'sponsor'] as const;

function isValidAccountLabel(label: string): boolean {
  return ACCOUNT_LABELS.includes(label.toLowerCase() as any);
}

function isValidAmount(amount: string): boolean {
  if (!amount || typeof amount !== 'string') return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 10000; // reasonable limits
}

function isValidMemo(memo: string): boolean {
  if (typeof memo !== 'string') return false;
  // Memo will be encoded as bytes32, so limit to reasonable length
  return memo.length > 0 && memo.length <= 31;
}

export function validateSendRequest(data: unknown): ValidationResult<SendRequest> {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      errors: [{ field: 'body', message: 'Request body must be an object' }]
    };
  }

  const req = data as Record<string, unknown>;

  if (!isValidAccountLabel(req.from as string)) {
    errors.push({
      field: 'from',
      message: `Invalid sender. Must be one of: ${ACCOUNT_LABELS.join(', ')}`
    });
  }

  if (!isValidAccountLabel(req.to as string)) {
    errors.push({
      field: 'to',
      message: `Invalid recipient. Must be one of: ${ACCOUNT_LABELS.join(', ')}`
    });
  }

  if (req.from === req.to) {
    errors.push({
      field: 'to',
      message: 'Cannot send to yourself'
    });
  }

  if (!isValidAmount(req.amount as string)) {
    errors.push({
      field: 'amount',
      message: 'Amount must be a positive number as string (max 10000)'
    });
  }

  if (!isValidMemo(req.memo as string)) {
    errors.push({
      field: 'memo',
      message: 'Memo must be a non-empty string (max 31 characters)'
    });
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      from: req.from as string,
      to: req.to as string,
      amount: req.amount as string,
      memo: req.memo as string,
    }
  };
}

export function validateBatchRequest(data: unknown): ValidationResult<BatchRequest> {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      errors: [{ field: 'body', message: 'Request body must be an object' }]
    };
  }

  const req = data as Record<string, unknown>;

  if (!isValidAccountLabel(req.from as string)) {
    errors.push({
      field: 'from',
      message: `Invalid sender. Must be one of: ${ACCOUNT_LABELS.join(', ')}`
    });
  }

  if (!Array.isArray(req.payments)) {
    errors.push({
      field: 'payments',
      message: 'Payments must be an array'
    });
  } else {
    if (req.payments.length === 0) {
      errors.push({
        field: 'payments',
        message: 'At least one payment required'
      });
    } else if (req.payments.length > 10) {
      errors.push({
        field: 'payments',
        message: 'Maximum 10 payments per batch'
      });
    }

    req.payments.forEach((payment, index) => {
      if (!payment || typeof payment !== 'object') {
        errors.push({
          field: `payments[${index}]`,
          message: 'Payment must be an object'
        });
        return;
      }

      const p = payment as Record<string, unknown>;

      if (!isValidAccountLabel(p.to as string)) {
        errors.push({
          field: `payments[${index}].to`,
          message: `Invalid recipient. Must be one of: ${ACCOUNT_LABELS.join(', ')}`
        });
      }

      if (!isValidAmount(p.amount as string)) {
        errors.push({
          field: `payments[${index}].amount`,
          message: 'Amount must be a positive number as string'
        });
      }

      if (!isValidMemo(p.memo as string)) {
        errors.push({
          field: `payments[${index}].memo`,
          message: 'Memo must be a non-empty string (max 31 characters)'
        });
      }
    });
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      from: req.from as string,
      payments: (req.payments as any[]).map(p => ({
        to: p.to as string,
        amount: p.amount as string,
        memo: p.memo as string,
      }))
    }
  };
}

export function validateHistoryRequest(data: unknown): ValidationResult<HistoryRequest> {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      errors: [{ field: 'body', message: 'Request body must be an object' }]
    };
  }

  const req = data as Record<string, unknown>;

  if (!isValidAccountLabel(req.account as string)) {
    errors.push({
      field: 'account',
      message: `Invalid account. Must be one of: ${ACCOUNT_LABELS.join(', ')}`
    });
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      account: req.account as string,
    }
  };
}