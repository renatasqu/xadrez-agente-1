// Fixtures geradas pelos validadores reais, sem alterar o catálogo de produção.
import type { Exercise, ValidationResult } from "../types";
export const CENARIOS: Record<string, { exercise: Exercise; results: Record<string, ValidationResult> }> = {
  "a1": {
    "exercise": {
      "id": "a1-cavalo",
      "version": 1,
      "prompt": "Mova o cavalo de b1 para qualquer casa legal.",
      "fen": "4k3/8/8/8/8/8/8/1N2K3 w - - 0 1",
      "goal": {
        "type": "reach_legal_square",
        "piece": {
          "square": "b1",
          "piece": "knight",
          "color": "white"
        }
      }
    },
    "results": {
      "incorrect": {
        "status": "incorrect",
        "resulting_fen": "4k3/8/8/8/8/8/8/1N2K3 w - - 0 1",
        "facts": [
          {
            "source": "b1",
            "destination": "b3",
            "code": "straight_knight_move"
          }
        ],
        "next_hint": null,
        "history": []
      },
      "correct": {
        "status": "correct",
        "resulting_fen": "4k3/8/8/8/8/2N5/8/4K3 b - - 1 1",
        "facts": [
          {
            "source": "b1",
            "destination": "c3",
            "code": "legal_destination"
          }
        ],
        "next_hint": null,
        "history": []
      }
    }
  },
  "a2": {
    "exercise": {
      "id": "a2-roque-bloqueado",
      "version": 1,
      "prompt": "As brancas podem fazer roque pequeno nesta posição?",
      "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "goal": {
        "type": "answer_position_question",
        "question": "can_castle",
        "side": "kingside"
      }
    },
    "results": {
      "correct": {
        "status": "correct",
        "resulting_fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "facts": [
          {
            "code": "path_occupied",
            "squares": [
              "f1",
              "g1"
            ]
          }
        ],
        "next_hint": null,
        "history": []
      }
    }
  },
  "a3": {
    "exercise": {
      "id": "a3-garfo-cavalo",
      "version": 1,
      "prompt": "Crie um garfo com o cavalo de b5 e capture um alvo para ganhar pelo menos 3 pontos materiais.",
      "fen": "r3k3/8/8/1N3r2/8/8/8/4K2R w - - 0 1",
      "goal": {
        "type": "knight_fork_gain",
        "piece": {
          "square": "b5",
          "piece": "knight",
          "color": "white"
        },
        "min_material_gain": 3,
        "max_student_moves": 2,
        "opponent_policy": "material_minimax_v1"
      }
    },
    "results": {
      "partial": {
        "status": "partial",
        "resulting_fen": "r7/2Nk4/8/5r2/8/8/8/4K2R w - - 2 2",
        "facts": [
          {
            "code": "fork",
            "attacker": {
              "square": "c7",
              "piece": "knight",
              "color": "white"
            },
            "square": "c7",
            "targets": [
              {
                "square": "a8",
                "piece": "rook",
                "color": "black"
              },
              {
                "square": "e8",
                "piece": "king",
                "color": "black"
              }
            ],
            "gives_check": true,
            "fen": "r3k3/2N5/8/5r2/8/8/8/4K2R b - - 1 1"
          },
          {
            "code": "opponent_reply",
            "move": "e8d7",
            "policy": "material_minimax_v1"
          }
        ],
        "next_hint": null,
        "history": [
          "b5c7",
          "e8d7"
        ]
      },
      "correct": {
        "status": "correct",
        "resulting_fen": "N7/8/2k5/5r2/8/8/8/4K2R w - - 1 3",
        "facts": [
          {
            "code": "opponent_reply",
            "move": "d7c6",
            "policy": "material_minimax_v1"
          },
          {
            "code": "material_gain",
            "initial_balance": -2,
            "final_balance": 3,
            "net_gain": 5,
            "required_gain": 3,
            "fen": "N7/8/2k5/5r2/8/8/8/4K2R w - - 1 3"
          }
        ],
        "next_hint": null,
        "history": [
          "b5c7",
          "e8d7",
          "c7a8",
          "d7c6"
        ]
      }
    }
  },
  "e1": {
    "exercise": {
      "id": "e1-material-seguro",
      "version": 1,
      "prompt": "Encontre um lance que evite perder material nos próximos três plies.",
      "fen": "2r1k3/8/8/8/8/2N5/8/4K3 w - - 0 1",
      "goal": {
        "type": "avoid_material_loss",
        "max_material_loss": 0,
        "horizon_plies": 3,
        "opponent_policy": "bounded_safety_v1"
      }
    },
    "results": {
      "incorrect": {
        "status": "incorrect",
        "resulting_fen": "2r1k3/8/8/8/8/2N5/8/4K3 w - - 0 1",
        "facts": [
          {
            "code": "material_loss",
            "initial_balance": -2,
            "final_balance": -5,
            "loss": 3,
            "max_material_loss": 0,
            "moves": [
              "e1f2",
              "c8c3",
              "f2e1"
            ],
            "resulting_fen": "4k3/8/8/8/8/2r5/8/4K3 b - - 1 2"
          }
        ],
        "next_hint": null,
        "history": []
      },
      "correct": {
        "status": "correct",
        "resulting_fen": "2r1k3/8/8/8/N7/8/8/4K3 b - - 1 1",
        "facts": [
          {
            "source": "c3",
            "destination": "a4",
            "code": "legal_destination"
          }
        ],
        "next_hint": null,
        "history": []
      }
    }
  },
  "mate": {
    "exercise": {
      "id": "e1-material-seguro",
      "version": 1,
      "prompt": "Evite permitir mate imediato.",
      "fen": "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq e6 0 2",
      "goal": {
        "type": "avoid_material_loss",
        "max_material_loss": 0,
        "horizon_plies": 3,
        "opponent_policy": "bounded_safety_v1"
      }
    },
    "results": {
      "incorrect": {
        "status": "incorrect",
        "resulting_fen": "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq e6 0 2",
        "facts": [
          {
            "code": "allows_mate",
            "mated_king": {
              "square": "e1",
              "piece": "king",
              "color": "white"
            },
            "mate_in_opponent_moves": 1,
            "moves": [
              "g2g4",
              "d8h4"
            ],
            "resulting_fen": "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
          }
        ],
        "next_hint": null,
        "history": []
      }
    }
  }
};
