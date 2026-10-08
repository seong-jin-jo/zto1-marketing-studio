export class GenerationOperationGate {
  private sequence = 0;
  private active: number | null = null;

  begin(): number | null {
    if (this.active !== null) return null;
    this.sequence += 1;
    this.active = this.sequence;
    return this.active;
  }

  isCurrent(operationId: number | undefined): boolean {
    return operationId === undefined || this.active === operationId;
  }

  finish(operationId: number): boolean {
    if (this.active !== operationId) return false;
    this.active = null;
    return true;
  }

  invalidate(): void {
    this.sequence += 1;
    this.active = null;
  }
}
