export function matrixZeros(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

export function matrixSubtract(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = a[0].length;
  const result = matrixZeros(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i][j] = a[i][j] - b[i][j];
    }
  }
  return result;
}

export function transpose(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result = matrixZeros(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = matrix[i][j];
    }
  }
  return result;
}

function rref(matrix: number[][]): { result: number[][]; pivots: number[] } {
  const m = matrix.length;
  if (m === 0) return { result: [], pivots: [] };
  const n = matrix[0].length;
  const A = matrix.map(row => [...row]);
  const pivots: number[] = [];
  let row = 0;

  for (let col = 0; col < n && row < m; col++) {
    let pivotRow = row;
    while (pivotRow < m && Math.abs(A[pivotRow][col]) < 1e-10) {
      pivotRow++;
    }
    if (pivotRow === m) continue;

    if (pivotRow !== row) {
      [A[row], A[pivotRow]] = [A[pivotRow], A[row]];
    }

    const pivotVal = A[row][col];
    for (let j = 0; j < n; j++) {
      A[row][j] /= pivotVal;
    }

    for (let i = 0; i < m; i++) {
      if (i !== row && Math.abs(A[i][col]) > 1e-10) {
        const factor = A[i][col];
        for (let j = 0; j < n; j++) {
          A[i][j] -= factor * A[row][j];
        }
      }
    }

    pivots.push(col);
    row++;
  }

  return { result: A, pivots };
}

export function findNullSpace(A: number[][]): number[][] {
  const m = A.length;
  if (m === 0) return [];
  const n = A[0].length;
  if (n === 0) return [];

  const { result: R, pivots } = rref(A);
  const pivotSet = new Set(pivots);

  const freeCols = Array.from({ length: n }, (_, i) => i).filter(
    i => !pivotSet.has(i)
  );

  const basis: number[][] = [];

  for (const freeCol of freeCols) {
    const vec = new Array(n).fill(0);
    vec[freeCol] = 1;

    for (let i = 0; i < R.length; i++) {
      let pivotCol = -1;
      for (let j = 0; j < n; j++) {
        if (Math.abs(R[i][j]) > 1e-10) {
          pivotCol = j;
          break;
        }
      }
      if (pivotCol !== -1 && pivotSet.has(pivotCol)) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          if (j !== pivotCol) {
            sum += R[i][j] * vec[j];
          }
        }
        vec[pivotCol] = -sum;
      }
    }

    basis.push(vec);
  }

  return basis;
}

export function hasPositiveNullVector(C: number[][]): boolean {
  const CT = transpose(C);
  if (CT.length === 0 || CT[0].length === 0) return true;

  const basis = findNullSpace(CT);
  if (basis.length === 0) {
    return true;
  }

  for (const vec of basis) {
    if (vec.every(v => v > 1e-10)) return true;
    if (vec.every(v => v < -1e-10)) return true;
  }

  if (basis.length >= 2) {
    for (let i = 0; i < basis.length; i++) {
      for (let j = i + 1; j < basis.length; j++) {
        const sum = basis[i].map((v, k) => v + basis[j][k]);
        if (sum.every(v => v > 1e-10)) return true;
        if (sum.every(v => v < -1e-10)) return true;
      }
    }
  }

  return false;
}
